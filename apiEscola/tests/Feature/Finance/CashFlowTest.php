<?php

namespace Tests\Feature\Finance;

use App\Models\BankStatementSync;
use App\Models\Expense;
use App\Models\FinanceCategory;
use App\Models\Invoice;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Fluxo de caixa: realizado × previsto, projeção só com o que está em aberto, saldo do banco só quando a Cora informa. */
class CashFlowTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        Carbon::setTestNow('2026-11-04 15:00:00'); // quarta-feira
        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function invoice(array $attrs): Invoice
    {
        return Invoice::factory()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $this->tenant->id])->id,
            'status' => 'pending',
            'payment_method' => 'pix',
        ], $attrs));
    }

    private function expense(array $attrs): Expense
    {
        return Expense::query()->create(array_merge(['tenant_id' => $this->tenant->id, 'description' => 'Despesa', 'status' => 'approved'], $attrs));
    }

    public function test_weekly_realized_planned_and_projection(): void
    {
        // Semana passada (26/10–01/11): previsto 300, pago 300 (um deles às 22h de 01/11 em Brasília = 01h de 02/11 em UTC).
        $this->invoice(['amount' => 100, 'due_date' => '2026-10-28', 'status' => 'paid', 'paid_at' => '2026-10-28 15:00:00']);
        $this->invoice(['amount' => 200, 'due_date' => '2026-11-01', 'status' => 'paid', 'paid_at' => '2026-11-02 01:00:00']);
        // Semana atual (02/11–08/11): já pago 150; em aberto 175 vencendo sexta; vencido ontem (fora da projeção) 90.
        $this->invoice(['amount' => 150, 'due_date' => '2026-11-03', 'status' => 'paid', 'paid_at' => '2026-11-03 12:00:00']);
        $this->invoice(['amount' => 175, 'due_date' => '2026-11-06']);
        $this->invoice(['amount' => 90, 'due_date' => '2026-11-03', 'status' => 'overdue']);
        // Importada pela sincronização Cora: fora, como na Visão geral.
        $this->invoice(['amount' => 999, 'due_date' => '2026-11-06', 'cora_payload' => ['integration' => ['origin' => 'cora_sync']]]);
        // Cancelada: fora.
        $this->invoice(['amount' => 500, 'due_date' => '2026-11-10', 'status' => 'cancelled']);
        // Próxima semana (09/11–15/11): previsto 400.
        $this->invoice(['amount' => 400, 'due_date' => '2026-11-10']);

        $rent = FinanceCategory::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'Ocupação']);
        $this->expense(['amount' => 120, 'due_date' => '2026-10-30', 'status' => 'paid', 'paid_at' => '2026-10-30 13:00:00', 'category_id' => $rent->id]);
        $this->expense(['amount' => 60, 'due_date' => '2026-11-07']);
        $this->expense(['amount' => 30, 'due_date' => '2026-11-12', 'status' => 'pending_approval']);
        $this->expense(['amount' => 5000, 'due_date' => '2026-11-12', 'status' => 'draft']);

        $body = $this->actingAs($this->admin)->getJson('/api/finance/cash-flow?granularity=weekly&date_from=2026-10-26&date_to=2026-11-15')
            ->assertOk()->json('body');

        $this->assertSame(['2026-10-26', '2026-11-15'], [$body['period']['from'], $body['period']['to']]);
        $this->assertSame(['past', 'current', 'future'], array_column($body['buckets'], 'state'));
        $this->assertSame('26/10–01/11', $body['buckets'][0]['label']);

        [$past, $current, $future] = $body['buckets'];
        // O pagamento das 22h de 01/11 (Brasília) fica na semana passada, mesmo sendo 02/11 em UTC.
        $this->assertSame(['300.00', '300.00', '120.00', '120.00'], [$past['planned_in'], $past['realized_in'], $past['planned_out'], $past['realized_out']]);
        $this->assertSame('180.00', $past['flow']);

        $this->assertSame('150.00', $current['realized_in']);
        $this->assertSame('415.00', $current['planned_in']); // 150 + 175 + 90 (o vencido conta no previsto)
        // Semana atual: realizado 150 + em aberto a partir de hoje (175 - 60); o vencido de 90 fica fora.
        $this->assertSame('265.00', $current['flow']);

        $this->assertNull($future['realized_in']);
        $this->assertSame(['400.00', '30.00', '370.00'], [$future['planned_in'], $future['planned_out'], $future['flow']]);
        $this->assertSame('815.00', $future['cumulative']);
        $this->assertSame('815.00', $body['projected_result']);

        $this->assertSame(['count' => 1, 'amount' => '90.00'], $body['outside_projection']['overdue_receivables']);
        $this->assertSame(['450.00', '120.00'], [$body['realized']['inflow'], $body['realized']['outflow']]);
        $this->assertNull($body['bank_balance']);

        // Filtro de categoria vale só para as saídas.
        $filtered = $this->actingAs($this->admin)->getJson("/api/finance/cash-flow?granularity=weekly&date_from=2026-10-26&date_to=2026-11-15&category_id={$rent->id}")
            ->assertOk()->json('body');
        $this->assertSame(['120.00', '450.00'], [$filtered['totals']['realized_out'], $filtered['totals']['realized_in']]);
        $this->assertSame('120.00', $filtered['totals']['planned_out']);
    }

    public function test_daily_and_monthly_views_and_limits(): void
    {
        $this->actingAs($this->admin)->getJson('/api/finance/cash-flow?granularity=daily')
            ->assertOk()->assertJsonCount(28, 'body.buckets')->assertJsonPath('body.buckets.13.state', 'current');

        $monthly = $this->actingAs($this->admin)->getJson('/api/finance/cash-flow?granularity=monthly')->assertOk()->json('body');
        $this->assertSame('2026-06-01', $monthly['period']['from']);
        $this->assertSame('2027-02-28', $monthly['period']['to']);
        $this->assertSame('nov/26', $monthly['buckets'][5]['label']);

        $this->actingAs($this->admin)->getJson('/api/finance/cash-flow?granularity=daily&date_from=2026-01-01&date_to=2026-12-31')
            ->assertStatus(422);

        $professor = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor', 'status' => 'active']);
        $this->actingAs($professor)->getJson('/api/finance/cash-flow')->assertForbidden();
    }

    public function test_bank_balance_only_when_cora_reported_it(): void
    {
        // Sincronização com saldo informado pela Cora (end.balance em centavos).
        config(['services.cora.token' => 'token-de-teste', 'services.cora.api_base_url_stage' => 'https://api.stage.cora.com.br']);
        $this->invoice(['amount' => 100, 'due_date' => '2026-11-10', 'cora_charge_id' => 'inv_base', 'cora_payload' => ['integration' => ['provider' => 'cora', 'environment' => 'stage']], 'created_at' => '2026-06-01 12:00:00']);
        Http::fake(['https://api.stage.cora.com.br/bank-statement/statement*' => Http::response([
            'start' => ['date' => '2026-11-01T00:00:00', 'balance' => 1000000],
            'entries' => [],
            'end' => ['date' => '2026-11-04T00:00:00', 'balance' => 2153077],
        ])]);

        $this->actingAs($this->admin)->postJson('/api/finance/reconciliation/sync', ['date_from' => '2026-11-01', 'date_to' => '2026-11-04'])->assertOk();
        $this->assertSame('21530.77', (string) BankStatementSync::query()->latest('id')->value('balance_end'));

        $this->actingAs($this->admin)->getJson('/api/finance/cash-flow')
            ->assertOk()
            ->assertJsonPath('body.bank_balance.amount', '21530.77')
            ->assertJsonPath('body.bank_balance.as_of', '2026-11-04T00:00:00.000000Z');
    }
}
