<?php

namespace Tests\Feature\Reconciliation;

use App\Models\BankStatementEntry;
use App\Models\BankStatementEntryLog;
use App\Models\BankStatementSync;
use App\Models\Invoice;
use App\Models\InvoiceAuditLog;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Conciliação bancária: só cobranças Cora geradas pelo sistema, a partir da primeira delas; nunca concilia
 * só por valor/data; Cora confirma antes de baixar; tudo com justificativa.
 */
class BankReconciliationTest extends TestCase
{
    use RefreshDatabase;

    private const STATEMENT_URL = 'https://api.stage.cora.com.br/bank-statement/statement*';

    private const CORA_INVOICE_URL = 'https://api.stage.cora.com.br/v2/invoices/*';

    private Tenant $tenant;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        config(['services.cora.token' => 'token-de-teste', 'services.cora.api_base_url_stage' => 'https://api.stage.cora.com.br']);

        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']);
    }

    private function invoice(array $attrs = [], ?Tenant $tenant = null): Invoice
    {
        $tenant ??= $this->tenant;

        return Invoice::factory()->create(array_merge([
            'tenant_id' => $tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Mateus Albuquerque Rocha'])->id,
            'amount' => 175,
            'status' => 'pending',
            'due_date' => '2026-11-03',
            'payment_method' => 'pix',
            'cora_charge_id' => null,
            'cora_payload' => null,
            // A escola passou a gerar cobranças na Cora pelo sistema em junho.
            'created_at' => '2026-06-01 12:00:00',
        ], $attrs));
    }

    private function coraInvoice(string $chargeId, array $attrs = []): Invoice
    {
        return $this->invoice(array_merge([
            'cora_charge_id' => $chargeId,
            'cora_payload' => ['integration' => ['provider' => 'cora', 'environment' => 'stage']],
        ], $attrs));
    }

    /** Cobrança trazida da Cora pela sincronização (não gerada pelo sistema). */
    private function importedInvoice(string $chargeId, array $attrs = []): Invoice
    {
        return $this->invoice(array_merge([
            'cora_charge_id' => $chargeId,
            'cora_payload' => ['integration' => ['provider' => 'cora', 'environment' => 'stage', 'origin' => 'cora_sync']],
        ], $attrs));
    }

    private function entry(array $attrs = []): BankStatementEntry
    {
        return BankStatementEntry::create(array_merge([
            'tenant_id' => $this->tenant->id,
            'environment' => 'stage',
            'source' => 'cora',
            'external_id' => 'ent_' . uniqid(),
            'direction' => 'credit',
            'transaction_type' => 'PIX',
            'amount' => '175.00',
            'occurred_at' => '2026-11-03 11:41:00',
            'description' => 'PIX RECEBIDO',
            'counterparty_name' => 'M S ROCHA',
            'status' => 'pending',
        ], $attrs));
    }

    /** @param  array<int, array<string, mixed>>  $entries */
    private function statement(array $entries): array
    {
        return ['start' => ['date' => '2026-11-01T00:00:00', 'balance' => 0], 'entries' => $entries, 'end' => ['date' => '2026-11-03T00:00:00', 'balance' => 0], 'header' => []];
    }

    private function raw(string $id, string $type, int $cents, string $description, array $extra = []): array
    {
        return array_replace_recursive([
            'id' => $id,
            'type' => $type,
            'amount' => $cents,
            'createdAt' => '2026-11-03T08:41:00-03:00',
            'transaction' => [
                'id' => 'trx_' . $id,
                'type' => 'PIX',
                'description' => $description,
                'counterParty' => ['name' => 'M S ROCHA', 'identity' => '12345678901'],
            ],
        ], $extra);
    }

    public function test_sync_imports_once_and_only_auto_reconciles_by_cited_charge_id_with_equal_amount(): void
    {
        $cited = $this->coraInvoice('inv_7Hq2LmZs90');
        $sameValueNoId = $this->invoice();
        $this->importedInvoice('inv_Importada01');

        Http::fake([
            self::STATEMENT_URL => Http::response($this->statement([
                $this->raw('ent_1', 'CREDIT', 17500, 'PIX COBRANCA inv_7Hq2LmZs90'),
                $this->raw('ent_2', 'CREDIT', 17500, 'PIX RECEBIDO'),
                $this->raw('ent_3', 'BLOCK', 5000, 'BLOQUEIO JUDICIAL'),
                $this->raw('ent_4', 'DEBIT', 3990, 'TARIFA PACOTE SERVICOS', ['transaction' => ['type' => 'FEE']]),
                $this->raw('ent_5', 'CREDIT', 17500, 'PIX COBRANCA inv_Importada01'),
            ])),
            self::CORA_INVOICE_URL => Http::response(['id' => 'inv_7Hq2LmZs90', 'status' => 'PAID', 'paid_at' => '2026-11-03T08:41:00-03:00']),
        ]);

        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync', ['date_from' => '2026-11-01', 'date_to' => '2026-11-03'])
            ->assertOk()
            ->assertJsonPath('body.created', 4)
            ->assertJsonPath('body.auto_reconciled', 1);

        $auto = BankStatementEntry::where('external_id', 'ent_1')->sole();
        $this->assertSame('reconciled', $auto->status);
        $this->assertSame('auto', $auto->match_type);
        $this->assertSame($cited->id, $auto->invoice_id);
        $this->assertSame('2026-11-03 11:41:00', $auto->occurred_at->utc()->toDateTimeString());
        // A baixa veio da consulta à Cora, não do extrato.
        $this->assertSame('paid', $cited->refresh()->status);

        // Mesmo valor sem ID de cobrança: nunca concilia sozinho.
        $this->assertSame('pending', BankStatementEntry::where('external_id', 'ent_2')->sole()->status);
        $this->assertSame('pending', $sameValueNoId->refresh()->status);

        // Cobrança importada pela sincronização Cora não entra na conciliação.
        $this->assertSame('pending', BankStatementEntry::where('external_id', 'ent_5')->sole()->status);

        $fee = BankStatementEntry::where('external_id', 'ent_4')->sole();
        $this->assertSame(['debit', 'FEE', '39.90'], [$fee->direction, $fee->transaction_type, (string) $fee->amount]);

        $this->assertDatabaseMissing('bank_statement_entries', ['external_id' => 'ent_3']);
        $this->assertStringNotContainsString('12345678901', json_encode(BankStatementEntry::all()->toArray()));

        // Segunda sincronização do mesmo período não duplica nem altera nada.
        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync', ['date_from' => '2026-11-01', 'date_to' => '2026-11-03'])
            ->assertOk()
            ->assertJsonPath('body.created', 0);
        $this->assertSame(4, BankStatementEntry::count());
    }

    /** ID da transação como a Cora escreve no extrato: UUID do pagamento em base64. */
    private function trx(string $uuid): string
    {
        return 'trx_' . rtrim(strtr(base64_encode(hex2bin(str_replace('-', '', $uuid))), '+/', '-_'), '=');
    }

    private function paidWithPayment(string $chargeId, string $paymentId, int $totalPaidCents, array $attrs = []): Invoice
    {
        return $this->coraInvoice($chargeId, array_merge([
            'status' => 'paid',
            'paid_at' => '2026-11-02 14:00:00',
            'cora_payload' => [
                'integration' => ['provider' => 'cora', 'environment' => 'stage'],
                'payments' => [['id' => $paymentId, 'total_paid' => $totalPaidCents]],
            ],
        ], $attrs));
    }

    public function test_payment_id_in_statement_links_app_charges_and_relinks_on_next_sync(): void
    {
        [$u1, $u2, $u3, $u4, $u5] = array_map(fn () => (string) Str::uuid(), range(1, 5));
        $plain = $this->paidWithPayment('inv_a', $u1, 17500);
        $interest = $this->paidWithPayment('inv_j', $u2, 18464);
        $wrong = $this->paidWithPayment('inv_w', $u3, 17500);
        $later = $this->coraInvoice('inv_l');
        $imported = $this->importedInvoice('inv_imp', ['status' => 'paid', 'cora_payload' => [
            'integration' => ['provider' => 'cora', 'origin' => 'cora_sync'],
            'payments' => [['id' => $u5, 'total_paid' => 17500]],
        ]]);

        $raw = fn (string $id, string $uuid, int $cents) => [
            'id' => $id, 'type' => 'CREDIT', 'amount' => $cents, 'createdAt' => '2026-11-03T08:41:00-03:00',
            'transaction' => ['id' => $this->trx($uuid), 'type' => 'PAYMENT', 'description' => null, 'counterParty' => ['name' => 'Pagador', 'identity' => '12345678901']],
        ];

        Http::fake([
            self::STATEMENT_URL => Http::response($this->statement([
                $raw('ent_plain', $u1, 17500),
                $raw('ent_interest', $u2, 18464),
                $raw('ent_wrong', $u3, 15000),
                $raw('ent_later', $u4, 17500),
                $raw('ent_imported', $u5, 17500),
            ])),
            self::CORA_INVOICE_URL => Http::response(['id' => 'inv_l', 'status' => 'OPEN']),
        ]);

        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync', ['date_from' => '2026-11-01', 'date_to' => '2026-11-03'])
            ->assertOk()->assertJsonPath('body.auto_reconciled', 2)->assertJsonPath('body.divergent', 1);

        $entry = fn (string $id) => BankStatementEntry::where('external_id', $id)->sole();

        $this->assertSame(['reconciled', 'auto', $plain->id, null], [$entry('ent_plain')->status, $entry('ent_plain')->match_type, $entry('ent_plain')->invoice_id, $entry('ent_plain')->divergence]);
        $this->assertSame(['reconciled', $interest->id], [$entry('ent_interest')->status, $entry('ent_interest')->invoice_id]);
        $this->assertStringContainsString('juros/multa', $entry('ent_interest')->divergence);
        // ID confere, valor não: divergente, mas já ligada à cobrança.
        $this->assertSame(['divergent', $wrong->id], [$entry('ent_wrong')->status, $entry('ent_wrong')->invoice_id]);
        $this->assertSame('pending', $entry('ent_later')->status);
        $this->assertSame(['pending', null], [$entry('ent_imported')->status, $entry('ent_imported')->invoice_id]);
        $this->assertSame('paid', $imported->refresh()->status);

        // Filtro de origem: só as ligadas a cobranças da aplicação.
        $this->actingAs($this->admin)->getJson('/api/finance/reconciliation/entries?origin=app')
            ->assertOk()->assertJsonPath('body.meta.total', 3);
        $this->actingAs($this->admin)->getJson('/api/finance/reconciliation/summary?origin=other')
            ->assertOk()->assertJsonPath('body.counts.pending', 2);

        // A baixa chega depois (webhook/sincronização diária grava o pagamento); a próxima sincronização liga.
        $later->update(['status' => 'paid', 'paid_at' => '2026-11-03 11:00:00', 'cora_payload' => [
            'integration' => ['provider' => 'cora', 'environment' => 'stage'],
            'payments' => [['id' => $u4, 'total_paid' => 17500]],
        ]]);

        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync', ['date_from' => '2026-11-01', 'date_to' => '2026-11-03'])
            ->assertOk()->assertJsonPath('body.created', 0)->assertJsonPath('body.auto_reconciled', 1);
        $this->assertSame(['reconciled', $later->id], [$entry('ent_later')->status, $entry('ent_later')->invoice_id]);
        $this->assertSame('pending', $entry('ent_imported')->status);
    }

    public function test_cited_charge_with_different_amount_or_on_a_debit_becomes_divergent(): void
    {
        $this->coraInvoice('inv_Kd82PqLm1a');
        $paid = $this->coraInvoice('inv_Aa91mKq2Lr', ['status' => 'paid', 'paid_at' => '2026-10-30 10:00:00']);

        Http::fake([
            self::STATEMENT_URL => Http::response($this->statement([
                $this->raw('ent_boleto', 'CREDIT', 18464, 'LIQUIDACAO BOLETO inv_Kd82PqLm1a'),
                $this->raw('ent_estorno', 'DEBIT', 17500, 'ESTORNO PIX inv_Aa91mKq2Lr'),
            ])),
        ]);

        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync')->assertOk()->assertJsonPath('body.divergent', 2);

        $boleto = BankStatementEntry::where('external_id', 'ent_boleto')->sole();
        $this->assertSame('divergent', $boleto->status);
        $this->assertStringContainsString('R$ 184,64', $boleto->divergence);
        $this->assertNull($boleto->invoice_id);

        $estorno = BankStatementEntry::where('external_id', 'ent_estorno')->sole();
        $this->assertSame('divergent', $estorno->status);
        $this->assertStringContainsString("#{$paid->id}", $estorno->divergence);
        $this->assertSame('paid', $paid->refresh()->status);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/v2/invoices/'));
    }

    public function test_manual_reconcile_only_accepts_cora_charges_generated_by_the_system(): void
    {
        $mine = $this->coraInvoice('inv_meu');
        $local = $this->invoice();
        $imported = $this->importedInvoice('inv_importada');
        $entry = $this->entry();

        $this->actingAs($this->admin)->getJson("/api/finance/reconciliation/entries/{$entry->id}/candidates")
            ->assertOk()
            ->assertJsonCount(1, 'body.items')
            ->assertJsonPath('body.items.0.id', $mine->id)
            ->assertJsonPath('body.items.0.criteria.amount_equal', true)
            ->assertJsonPath('body.items.0.criteria.charge_id_cited', false)
            ->assertJsonPath('body.items.0.criteria.date_window', true)
            ->assertJsonPath('body.items.0.criteria.name_hint', true);

        foreach ([$local, $imported] as $other) {
            $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$entry->id}/reconcile", [
                'invoice_id' => $other->id,
                'justification' => 'Pagador confirmado pela secretaria por WhatsApp.',
            ])->assertStatus(422)
                ->assertJsonPath('message', 'Só cobranças geradas pelo sistema na Cora podem ser conciliadas.');
            $this->assertSame('pending', $other->refresh()->status);
        }
        Http::assertNothingSent();

        Http::fake([self::CORA_INVOICE_URL => Http::response(['id' => 'inv_meu', 'status' => 'PAID', 'paid_at' => '2026-11-03T08:41:00-03:00'])]);

        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$entry->id}/reconcile", [
            'invoice_id' => $mine->id,
            'justification' => 'Pagador confirmado pela secretaria por WhatsApp.',
        ])->assertOk()
            ->assertJsonPath('body.status', 'reconciled')
            ->assertJsonPath('body.match_type', 'manual')
            ->assertJsonPath('body.reviewed_by.id', $this->admin->id);

        // A baixa veio da Cora, registrada em nome de quem conciliou.
        $mine->refresh();
        $this->assertSame('paid', $mine->status);
        $this->assertSame('2026-11-03 11:41:00', $mine->paid_at->utc()->toDateTimeString());
        $this->assertSame('user', InvoiceAuditLog::where('invoice_id', $mine->id)->where('action', 'paid')->sole()->source);

        $log = BankStatementEntryLog::where('entry_id', $entry->id)->sole();
        $this->assertSame(['reconciled', 'pending', 'reconciled', $this->admin->id], [$log->action, $log->from_status, $log->to_status, $log->user_id]);

        // A mesma cobrança não pode ser conciliada com outra movimentação.
        $other = $this->entry();
        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$other->id}/reconcile", [
            'invoice_id' => $mine->id,
            'justification' => 'Tentativa de conciliar em duplicidade.',
        ])->assertStatus(422);
        $this->assertSame('pending', $other->refresh()->status);
    }

    public function test_statement_starts_at_first_cora_charge_generated_by_the_system(): void
    {
        // Só cobrança importada: o sistema ainda não gerou nenhuma na Cora.
        $this->importedInvoice('inv_antiga', ['created_at' => '2026-03-01 10:00:00']);
        Http::fake([self::STATEMENT_URL => Http::response($this->statement([]))]);

        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync', ['date_from' => '2026-05-01', 'date_to' => '2026-06-10'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Nenhuma cobrança foi gerada na Cora por este sistema ainda; não há o que conciliar.');
        Http::assertNothingSent();

        $this->coraInvoice('inv_primeira');

        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync', ['date_from' => '2026-05-10', 'date_to' => '2026-05-31'])
            ->assertStatus(422);

        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync', ['date_from' => '2026-05-01', 'date_to' => '2026-06-10'])
            ->assertOk()
            ->assertJsonPath('body.period_start', '2026-06-01');
        Http::assertSent(fn ($request) => str_contains($request->url(), 'start=2026-06-01'));

        // Movimentação anterior (ex.: importada antes desta regra) não aparece nem conta.
        $this->entry(['occurred_at' => '2026-05-20 12:00:00']);
        $this->entry(['occurred_at' => '2026-06-02 12:00:00']);

        $this->actingAs($this->admin)->getJson('/api/finance/reconciliation/entries')->assertOk()->assertJsonPath('body.meta.total', 1);
        $this->actingAs($this->admin)->getJson('/api/finance/reconciliation/summary')
            ->assertOk()
            ->assertJsonPath('body.operating_since', '2026-06-01')
            ->assertJsonPath('body.credits.count', 1);
    }

    public function test_manual_reconcile_of_cora_invoice_requires_cora_confirmation(): void
    {
        $invoice = $this->coraInvoice('inv_aberto');
        $entry = $this->entry();
        $payload = ['invoice_id' => $invoice->id, 'justification' => 'Responsável enviou o comprovante do Pix.'];

        Http::fakeSequence(self::CORA_INVOICE_URL)
            ->push(['id' => 'inv_aberto', 'status' => 'OPEN'])
            ->push(['id' => 'inv_aberto', 'status' => 'PAID', 'paid_at' => '2026-11-03T08:41:00-03:00']);

        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$entry->id}/reconcile", $payload)
            ->assertStatus(422)
            ->assertJsonPath('message', "A Cora ainda não confirmou o pagamento da cobrança #{$invoice->id}. Nada foi conciliado.");
        $this->assertSame('pending', $entry->refresh()->status);
        $this->assertSame('pending', $invoice->refresh()->status);

        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$entry->id}/reconcile", $payload)
            ->assertOk()
            ->assertJsonPath('body.invoice.id', $invoice->id);
        $this->assertSame('paid', $invoice->refresh()->status);
    }

    public function test_ignore_and_undo_require_justification_and_undo_keeps_invoice_paid(): void
    {
        $entry = $this->entry(['direction' => 'debit', 'transaction_type' => 'FEE', 'amount' => '39.90']);

        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$entry->id}/ignore", ['justification' => 'curta'])
            ->assertStatus(422);

        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$entry->id}/ignore", ['justification' => 'Tarifa mensal do pacote de serviços.'])
            ->assertOk()->assertJsonPath('body.status', 'ignored');

        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$entry->id}/divergent", ['justification' => 'Não pode marcar algo ignorado.'])
            ->assertStatus(422);

        $invoice = $this->coraInvoice('inv_pago', ['status' => 'paid', 'paid_at' => '2026-11-03 11:41:00']);
        $credit = $this->entry();
        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$credit->id}/reconcile", [
            'invoice_id' => $invoice->id, 'justification' => 'Cobrança já baixada pelo webhook.',
        ])->assertOk();

        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$credit->id}/undo", ['justification' => 'Conciliado com a cobrança errada.'])
            ->assertOk()->assertJsonPath('body.status', 'pending')->assertJsonPath('body.invoice', null);
        $this->assertSame('paid', $invoice->refresh()->status);

        $this->actingAs($this->admin)->getJson("/api/finance/reconciliation/entries/{$credit->id}/history")
            ->assertOk()->assertJsonCount(2, 'body.items')->assertJsonPath('body.items.0.action', 'undone');
    }

    public function test_summary_and_list_are_tenant_isolated_and_permission_checked(): void
    {
        $this->coraInvoice('inv_base');
        $this->entry(['amount' => '100.00']);
        $this->entry(['amount' => '50.00', 'status' => 'reconciled']);
        $this->entry(['direction' => 'debit', 'amount' => '39.90', 'transaction_type' => 'FEE']);

        $otherTenant = Tenant::factory()->create();
        $foreign = BankStatementEntry::create([
            'tenant_id' => $otherTenant->id, 'environment' => 'stage', 'source' => 'cora', 'external_id' => 'ent_alheia',
            'direction' => 'credit', 'amount' => '999.00', 'occurred_at' => now(), 'status' => 'pending',
        ]);

        $this->actingAs($this->admin)->getJson('/api/finance/reconciliation/summary')
            ->assertOk()
            ->assertJsonPath('body.credits.count', 2)
            ->assertJsonPath('body.credits.amount', '150.00')
            ->assertJsonPath('body.debits.amount', '39.90')
            ->assertJsonPath('body.counts.pending', 2)
            ->assertJsonPath('body.counts.reconciled', 1)
            ->assertJsonPath('body.reconciled.amount', '50.00');

        $this->actingAs($this->admin)->getJson('/api/finance/reconciliation/entries?status=pending&search=100,00')
            ->assertOk()->assertJsonPath('body.meta.total', 1)->assertJsonPath('body.items.0.amount', '100.00');

        $this->actingAs($this->admin)->getJson("/api/finance/reconciliation/entries/{$foreign->id}/candidates")->assertNotFound();
        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$foreign->id}/ignore", ['justification' => 'Movimentação de outra escola.'])
            ->assertNotFound();
        $this->assertSame('pending', $foreign->refresh()->status);

        $professor = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor', 'status' => 'active']);
        $this->actingAs($professor)->getJson('/api/finance/reconciliation/entries')->assertForbidden();
    }

    public function test_sync_refused_by_cora_is_recorded_without_changes(): void
    {
        $this->coraInvoice('inv_base');
        Http::fake([self::STATEMENT_URL => Http::response(['message' => 'forbidden'], 403)]);

        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync')
            ->assertStatus(502)
            ->assertJsonPath('message', 'A Cora recusou o acesso ao extrato. Verifique se as credenciais têm permissão de extrato.');

        $run = BankStatementSync::sole();
        $this->assertSame('failed', $run->status);
        $this->assertStringContainsString('HTTP 403', $run->error);
        $this->assertSame(0, BankStatementEntry::count());
    }
}
