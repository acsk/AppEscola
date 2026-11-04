<?php

namespace Tests\Feature\Finance;

use App\Models\BankStatementEntry;
use App\Models\Expense;
use App\Models\FinanceCategory;
use App\Models\Invoice;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ConsolidatedReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        Carbon::setTestNow('2026-11-04 15:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_monthly_result_categories_position_and_pending_reconciliation(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $invoice = fn (array $a) => Invoice::factory()->create(array_merge([
            'tenant_id' => $tenant->id, 'student_id' => Student::factory()->create(['tenant_id' => $tenant->id])->id, 'payment_method' => 'pix',
        ], $a));

        $invoice(['amount' => 1000, 'due_date' => '2026-10-05', 'status' => 'paid', 'paid_at' => '2026-10-05 15:00:00']);
        $invoice(['amount' => 500, 'due_date' => '2026-11-03', 'status' => 'paid', 'paid_at' => '2026-11-03 15:00:00']);
        $invoice(['amount' => 175, 'due_date' => '2026-10-20', 'status' => 'overdue']);
        $invoice(['amount' => 175, 'due_date' => '2026-11-20']);
        // Cobrança Cora gerada pelo sistema (define o início da conciliação).
        $invoice(['amount' => 100, 'due_date' => '2026-11-25', 'cora_charge_id' => 'inv_x', 'cora_payload' => ['integration' => ['provider' => 'cora']], 'created_at' => '2026-06-01 12:00:00']);

        $rent = FinanceCategory::query()->create(['tenant_id' => $tenant->id, 'name' => 'Ocupação']);
        Expense::query()->create(['tenant_id' => $tenant->id, 'description' => 'Aluguel', 'amount' => 600, 'due_date' => '2026-10-10', 'status' => 'paid', 'paid_at' => '2026-10-10 13:00:00', 'category_id' => $rent->id]);
        Expense::query()->create(['tenant_id' => $tenant->id, 'description' => 'Avulsa', 'amount' => 40, 'due_date' => '2026-11-02', 'status' => 'paid', 'paid_at' => '2026-11-02 13:00:00']);
        Expense::query()->create(['tenant_id' => $tenant->id, 'description' => 'Energia', 'amount' => 80, 'due_date' => '2026-11-01', 'status' => 'approved']);

        BankStatementEntry::create(['tenant_id' => $tenant->id, 'environment' => 'stage', 'source' => 'cora', 'external_id' => 'ent_p', 'direction' => 'credit', 'amount' => 170, 'occurred_at' => '2026-11-03 12:00:00', 'status' => 'pending', 'description' => 'PIX']);
        BankStatementEntry::create(['tenant_id' => $tenant->id, 'environment' => 'stage', 'source' => 'cora', 'external_id' => 'ent_d', 'direction' => 'debit', 'amount' => 90, 'occurred_at' => '2026-11-03 12:00:00', 'status' => 'divergent']);
        BankStatementEntry::create(['tenant_id' => $tenant->id, 'environment' => 'stage', 'source' => 'cora', 'external_id' => 'ent_ok', 'direction' => 'credit', 'amount' => 50, 'occurred_at' => '2026-11-03 12:00:00', 'status' => 'reconciled']);

        $body = $this->actingAs($admin)->getJson('/api/finance/reports/consolidated?month_from=2026-10&month_to=2026-12')->assertOk()->json('body');

        $this->assertSame(['2026-10', '2026-11', '2026-12'], array_column($body['months'], 'month'));
        $this->assertSame(['1000.00', '600.00', '400.00'], [$body['months'][0]['revenue'], $body['months'][0]['expenses'], $body['months'][0]['result']]);
        $this->assertSame(['500.00', '40.00', '460.00'], [$body['months'][1]['revenue'], $body['months'][1]['expenses'], $body['months'][1]['result']]);
        $this->assertNull($body['months'][2]['revenue']);
        $this->assertSame(['1500.00', '640.00', '860.00'], array_values($body['totals']));

        $this->assertSame([['name' => 'Ocupação', 'count' => 1, 'amount' => '600.00'], ['name' => 'Sem categoria', 'count' => 1, 'amount' => '40.00']], $body['expenses_by_category']);
        $this->assertSame(['count' => 3, 'amount' => '450.00'], $body['position']['receivable_open']);
        $this->assertSame(['count' => 1, 'amount' => '175.00'], $body['position']['receivable_overdue']);
        $this->assertSame(['count' => 1, 'amount' => '80.00'], $body['position']['payable_overdue']);
        $this->assertCount(2, $body['reconciliation']['items']);

        // 24 meses é o limite: aceita; 25 recusa.
        $this->actingAs($admin)->getJson('/api/finance/reports/consolidated?month_from=2025-01&month_to=2026-12')->assertOk()->assertJsonCount(24, 'body.months');
        $this->actingAs($admin)->getJson('/api/finance/reports/consolidated?month_from=2024-12&month_to=2026-12')->assertStatus(422);
    }
}
