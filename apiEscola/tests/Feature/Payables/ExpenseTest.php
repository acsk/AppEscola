<?php

namespace Tests\Feature\Payables;

use App\Models\BankStatementEntry;
use App\Models\Expense;
use App\Models\ExpenseAuditLog;
use App\Models\FinanceCategory;
use App\Models\Invoice;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payables\RecurringExpenseService;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Contas a pagar: fluxo com aprovação, pagamento só como controle, recorrência sem duplicar, comprovantes e conciliação. */
class ExpenseTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        Carbon::setTestNow('2026-11-04 15:00:00');
        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function expense(array $attrs = []): Expense
    {
        return Expense::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'description' => 'Aluguel da sede',
            'amount' => '4800.00',
            'due_date' => '2026-11-05',
            'status' => 'approved',
        ], $attrs));
    }

    private function payablesOptions(): array
    {
        return $this->actingAs($this->admin)->getJson('/api/finance/payables/options')->assertOk()->json('body');
    }

    public function test_full_flow_with_approval_and_payment_as_control_only(): void
    {
        Http::fake();
        $options = $this->payablesOptions();
        $this->assertContains('Tarifas bancárias', array_column($options['categories'], 'name'));
        $this->assertContains('Pedagógico', array_column($options['cost_centers'], 'name'));
        $category = collect($options['categories'])->firstWhere('name', 'Ocupação')['id'];

        $secretaria = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'secretaria', 'status' => 'active']);

        $id = $this->actingAs($secretaria)->postJson('/api/finance/payables/expenses', [
            'description' => 'Aluguel da sede',
            'category_id' => $category,
            'amount' => 4800,
            'due_date' => '2026-11-05',
            'submit' => true,
        ])->assertCreated()
            ->assertJsonPath('body.status', 'pending_approval')
            ->assertJsonPath('body.code', fn ($code) => str_starts_with($code, 'D-'))
            ->json('body.id');

        // Secretaria cadastra, mas não aprova.
        $this->actingAs($secretaria)->postJson("/api/finance/payables/expenses/{$id}/approve")->assertForbidden();
        $this->actingAs($secretaria)->postJson("/api/finance/payables/expenses/{$id}/pay", ['payment_method' => 'pix'])
            ->assertStatus(422);

        $this->actingAs($this->admin)->postJson("/api/finance/payables/expenses/{$id}/approve")
            ->assertOk()->assertJsonPath('body.status', 'approved')->assertJsonPath('body.situation', 'approved');

        $this->actingAs($secretaria)->postJson("/api/finance/payables/expenses/{$id}/pay", ['payment_method' => 'pix', 'paid_at' => '2026-11-04'])
            ->assertOk()
            ->assertJsonPath('message', 'Pagamento registrado. Nenhum valor foi movimentado no banco.')
            ->assertJsonPath('body.status', 'paid');

        Http::assertNothingSent();
        $expense = Expense::query()->findOrFail($id);
        $this->assertSame('2026-11-04 03:00:00', $expense->paid_at->utc()->toDateTimeString());

        $this->actingAs($this->admin)->postJson("/api/finance/payables/expenses/{$id}/cancel", ['reason' => 'Lançada em duplicidade.'])
            ->assertStatus(422);

        $actions = ExpenseAuditLog::query()->where('expense_id', $id)->orderBy('id')->pluck('action')->all();
        $this->assertSame(['created', 'approved', 'paid'], $actions);

        $this->actingAs($this->admin)->postJson("/api/finance/payables/expenses/{$id}/reopen", ['reason' => 'Pagamento lançado por engano.'])
            ->assertOk()->assertJsonPath('body.status', 'approved');
        $this->assertSame('Pagamento lançado por engano.', ExpenseAuditLog::query()->where('expense_id', $id)->latest('id')->first()->reason);
    }

    public function test_references_from_another_school_and_roles_without_finance_are_rejected(): void
    {
        $other = Tenant::factory()->create();
        $foreignCategory = FinanceCategory::query()->create(['tenant_id' => $other->id, 'name' => 'Pessoal']);

        $this->actingAs($this->admin)->postJson('/api/finance/payables/expenses', [
            'description' => 'Folha', 'amount' => 100, 'due_date' => '2026-11-10', 'category_id' => $foreignCategory->id,
        ])->assertStatus(422)->assertJsonPath('message', 'Categoria não encontrado.');

        $foreign = Expense::query()->create(['tenant_id' => $other->id, 'description' => 'Alheia', 'amount' => 1, 'due_date' => '2026-11-10']);
        $this->actingAs($this->admin)->getJson("/api/finance/payables/expenses/{$foreign->id}")->assertNotFound();

        $professor = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor', 'status' => 'active']);
        $this->actingAs($professor)->getJson('/api/finance/payables/expenses')->assertForbidden();
    }

    public function test_editing_amount_of_approved_expense_requires_new_approval(): void
    {
        $expense = $this->expense();

        $this->actingAs($this->admin)->putJson("/api/finance/payables/expenses/{$expense->id}", [
            'description' => 'Aluguel da sede', 'amount' => 5000, 'due_date' => '2026-11-05', 'reason' => 'Reajuste anual do contrato.',
        ])->assertOk()->assertJsonPath('body.status', 'pending_approval')->assertJsonPath('body.amount', '5000.00');

        $log = ExpenseAuditLog::query()->where('expense_id', $expense->id)->latest('id')->first();
        $this->assertSame('Reajuste anual do contrato.', $log->reason);
        $this->assertEquals(['from' => '4800.00', 'to' => '5000.00'], $log->changes['amount']);
    }

    public function test_situations_filters_and_summary(): void
    {
        $category = FinanceCategory::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'Utilidades']);
        $this->expense(['description' => 'Energia', 'due_date' => '2026-10-30', 'amount' => 612.40, 'category_id' => $category->id]);
        $this->expense(['description' => 'Tarifa pacote', 'due_date' => '2026-11-01', 'amount' => 39.90, 'auto_debit' => true]);
        $this->expense(['description' => 'Internet', 'due_date' => '2026-11-15', 'amount' => 189.90, 'status' => 'draft']);
        $this->expense(['description' => 'Anúncios', 'due_date' => '2026-11-20', 'amount' => 2400, 'status' => 'pending_approval']);
        $this->expense(['description' => 'Gráfica', 'due_date' => '2026-11-12', 'amount' => 1280, 'status' => 'paid', 'paid_at' => '2026-10-31 15:00:00']);

        $situation = fn (string $s) => $this->actingAs($this->admin)->getJson("/api/finance/payables/expenses?situation={$s}")->assertOk()->json('body.items.*.description');

        $this->assertSame(['Energia'], $situation('overdue'));
        $this->assertSame(['Tarifa pacote'], $situation('awaiting_link'));
        $this->assertSame(['Internet'], $situation('draft'));
        $this->assertSame(['Anúncios'], $situation('pending_approval'));

        $this->actingAs($this->admin)->getJson('/api/finance/payables/expenses?search=D-' . Expense::query()->where('description', 'Gráfica')->value('id'))
            ->assertOk()->assertJsonPath('body.meta.total', 1);

        $this->actingAs($this->admin)->getJson('/api/finance/payables/summary?month=2026-11')
            ->assertOk()
            ->assertJsonPath('body.overdue.count', 1)
            ->assertJsonPath('body.overdue.amount', '612.40')
            ->assertJsonPath('body.pending_approval.amount', '2400.00')
            ->assertJsonPath('body.due_30_days.count', 1)
            ->assertJsonPath('body.paid_in_month.count', 0)
            ->assertJsonPath('body.without_receipt.count', 3)
            ->assertJsonPath('body.by_category.0.name', 'Sem categoria');
    }

    public function test_monthly_recurrence_keeps_the_day_and_never_duplicates(): void
    {
        $root = $this->actingAs($this->admin)->postJson('/api/finance/payables/expenses', [
            'description' => 'Aluguel', 'amount' => 4800, 'due_date' => '2026-10-31', 'recurrence' => 'monthly',
        ])->assertCreated()->json('body.id');
        $this->actingAs($this->admin)->postJson("/api/finance/payables/expenses/{$root}/approve")->assertOk();

        $service = app(RecurringExpenseService::class);
        $this->assertSame(1, $service->generate(null, Carbon::parse('2026-11-04')));
        $this->assertSame(0, $service->generate(null, Carbon::parse('2026-11-04')));

        $next = Expense::query()->where('series_id', $root)->where('id', '!=', $root)->sole();
        $this->assertSame(['2026-11-30', 'approved', 'monthly'], [$next->due_date->toDateString(), $next->status, $next->recurrence]);
        $this->assertStringContainsString('recorrência mensal', ExpenseAuditLog::query()->where('expense_id', $next->id)->value('reason'));

        // Mais à frente: dezembro volta ao dia 31.
        $service->generate(null, Carbon::parse('2026-12-02'));
        $this->assertSame('2026-12-31', Expense::query()->where('series_id', $root)->max('due_date'));

        // Tirar a recorrência da última encerra a série.
        Expense::query()->where('series_id', $root)->orderByDesc('due_date')->first()->update(['recurrence' => 'none']);
        $this->assertSame(0, $service->generate(null, Carbon::parse('2027-01-20')));
    }

    public function test_attachments_are_private_and_audited(): void
    {
        Storage::fake('local');
        $expense = $this->expense();

        $this->actingAs($this->admin)->post("/api/finance/payables/expenses/{$expense->id}/attachments", [
            'file' => UploadedFile::fake()->create('nota.exe', 10, 'application/x-msdownload'),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $attachmentId = $this->actingAs($this->admin)->post("/api/finance/payables/expenses/{$expense->id}/attachments", [
            'file' => UploadedFile::fake()->create('nota-fiscal.pdf', 120, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('body.attachments.0.id');

        $this->actingAs($this->admin)->get("/api/finance/payables/expenses/{$expense->id}/attachments/{$attachmentId}")
            ->assertOk()->assertDownload('nota-fiscal.pdf');

        $other = Tenant::factory()->create();
        $outsider = User::factory()->admin()->create(['tenant_id' => $other->id, 'status' => 'active']);
        $this->actingAs($outsider)->get("/api/finance/payables/expenses/{$expense->id}/attachments/{$attachmentId}", ['Accept' => 'application/json'])
            ->assertNotFound();

        $this->actingAs($this->admin)->deleteJson("/api/finance/payables/expenses/{$expense->id}/attachments/{$attachmentId}", ['reason' => 'Arquivo errado anexado.'])
            ->assertOk()->assertJsonCount(0, 'body.attachments');

        $this->assertSame(['created', 'attachment_added', 'attachment_removed'], ExpenseAuditLog::query()->where('expense_id', $expense->id)->orderBy('id')->pluck('action')->all());
    }

    public function test_cora_fees_group_into_monthly_expense_and_debits_link_to_expenses(): void
    {
        config(['services.cora.token' => 'token-de-teste', 'services.cora.api_base_url_stage' => 'https://api.stage.cora.com.br']);
        // A conciliação começa na primeira cobrança Cora gerada pelo sistema.
        Invoice::factory()->create([
            'tenant_id' => $this->tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $this->tenant->id])->id,
            'amount' => 100, 'status' => 'pending', 'due_date' => '2026-11-10',
            'cora_charge_id' => 'inv_base', 'cora_payload' => ['integration' => ['provider' => 'cora', 'environment' => 'stage']],
            'created_at' => '2026-06-01 12:00:00',
        ]);

        $fee = fn (string $id, int $cents, string $at) => [
            'id' => $id, 'type' => 'DEBIT', 'amount' => $cents, 'createdAt' => $at,
            'transaction' => ['id' => 'trx_' . $id, 'type' => 'FEE', 'description' => 'Taxa boleto compensado via API', 'counterParty' => ['name' => 'Cora SCFI', 'identity' => '1']],
        ];
        Http::fake(['https://api.stage.cora.com.br/bank-statement/statement*' => Http::response(['entries' => [
            $fee('ent_f1', 170, '2026-11-03T16:00:00-03:00'),
            $fee('ent_f2', 170, '2026-11-04T09:00:00-03:00'),
            ['id' => 'ent_pix', 'type' => 'DEBIT', 'amount' => 480000, 'createdAt' => '2026-11-04T10:00:00-03:00',
                'transaction' => ['id' => 'trx_pix', 'type' => 'PIX', 'description' => null, 'counterParty' => ['name' => 'IMOBILIARIA HORIZONTE', 'identity' => '1']]],
        ]])]);

        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync', ['date_from' => '2026-11-01', 'date_to' => '2026-11-04'])
            ->assertOk()->assertJsonPath('body.auto_reconciled', 2);

        $fees = Expense::query()->where('system_key', 'bank_fees:cora:2026-11')->sole();
        $this->assertSame(['3.40', 'paid', 'Tarifas bancárias Cora · 11/2026'], [(string) $fees->amount, $fees->status, $fees->description]);
        $this->assertSame('Tarifas bancárias', $fees->category->name);
        $this->assertSame('Banco Cora', $fees->supplier->name);

        // Despesa do sistema não é editável nem recebe vínculo manual.
        $this->actingAs($this->admin)->putJson("/api/finance/payables/expenses/{$fees->id}", ['description' => 'x', 'amount' => 1, 'due_date' => '2026-11-30'])
            ->assertStatus(422);

        $f1 = BankStatementEntry::query()->where('external_id', 'ent_f1')->sole();
        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$f1->id}/undo", ['justification' => 'Conferência manual da tarifa.'])
            ->assertOk();
        $this->assertSame('1.70', (string) $fees->refresh()->amount);

        // Saída comum: só com despesa aprovada, e a despesa fica paga com a data do extrato.
        $rent = $this->expense(['status' => 'pending_approval']);
        $pix = BankStatementEntry::query()->where('external_id', 'ent_pix')->sole();
        $payload = ['expense_id' => $rent->id, 'justification' => 'Pix do aluguel conferido no extrato.'];

        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$pix->id}/reconcile-expense", $payload)
            ->assertStatus(422)->assertJsonPath('message', 'Aprove a despesa antes de conciliar.');

        $rent->update(['status' => 'approved']);
        $this->actingAs($this->admin)->getJson("/api/finance/reconciliation/entries/{$pix->id}/expense-candidates")
            ->assertOk()
            ->assertJsonPath('body.items.0.id', $rent->id)
            ->assertJsonPath('body.items.0.criteria.amount_equal', true)
            ->assertJsonPath('body.items.0.criteria.date_window', true);

        $this->actingAs($this->admin)->postJson("/api/finance/reconciliation/entries/{$pix->id}/reconcile-expense", $payload)
            ->assertOk()->assertJsonPath('body.expense.id', $rent->id)->assertJsonPath('body.status', 'reconciled');

        $rent->refresh();
        $this->assertSame(['paid', 'pix', '2026-11-04 13:00:00'], [$rent->status, $rent->payment_method, $rent->paid_at->utc()->toDateTimeString()]);
        $this->assertStringContainsString('Conciliação bancária', ExpenseAuditLog::query()->where('expense_id', $rent->id)->where('action', 'paid')->value('reason'));

        // Desfazer o pagamento de despesa conciliada é bloqueado.
        $this->actingAs($this->admin)->postJson("/api/finance/payables/expenses/{$rent->id}/reopen", ['reason' => 'Tentativa de desfazer.'])
            ->assertStatus(422);

        $this->actingAs($this->admin)->getJson('/api/finance/reconciliation/entries?origin=expense')
            ->assertOk()->assertJsonPath('body.meta.total', 2);
    }
}
