<?php

namespace Tests\Feature\Finance;

use App\Models\BankStatementSync;
use App\Models\Expense;
use App\Models\FinanceCategory;
use App\Models\Tenant;
use App\Models\TenantCoraCredential;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceSettingsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']);
    }

    public function test_settings_overview_matches_permission_map_and_hides_secrets(): void
    {
        TenantCoraCredential::create([
            'tenant_id' => $this->tenant->id, 'environment' => 'stage', 'client_id' => 'cliente-secreto-123',
            'certificate_path' => 'cora/cert.pem', 'private_key_path' => 'cora/key.pem', 'active' => true, 'configured_at' => now(),
        ]);
        BankStatementSync::create([
            'tenant_id' => $this->tenant->id, 'environment' => 'stage', 'source' => 'cora', 'period_start' => '2026-11-01', 'period_end' => '2026-11-04',
            'status' => 'success', 'balance_end' => '21530.77', 'started_at' => now(), 'finished_at' => now(),
        ]);

        $response = $this->actingAs($this->admin)->getJson('/api/finance/settings')
            ->assertOk()
            ->assertJsonPath('body.can_configure', true)
            ->assertJsonPath('body.late_fees.configured', false)
            ->assertJsonPath('body.statement.bank_balance.amount', '21530.77');

        $json = json_encode($response->json());
        $this->assertStringNotContainsString('cliente-secreto-123', $json);
        $this->assertStringNotContainsString('cert.pem', $json);

        $matrix = collect($response->json('body.permissions'))->keyBy('ability');
        $this->assertTrue($matrix['finance.view']['roles']['secretaria']);
        $this->assertFalse($matrix['finance.payables.approve']['roles']['secretaria']);
        $this->assertTrue($matrix['finance.payables.approve']['roles']['financial']);
        $this->assertFalse($matrix['finance.configure']['roles']['financial']);
        $this->assertTrue($matrix['finance.configure']['roles']['admin']);
        $this->assertSame([], array_filter($matrix->map(fn ($row) => $row['roles']['professor'])->all()));
        $this->assertSame([], array_filter($matrix->map(fn ($row) => $row['roles']['coordenador'])->all()));

        $secretaria = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'secretaria', 'status' => 'active']);
        $this->actingAs($secretaria)->getJson('/api/finance/settings')->assertOk()->assertJsonPath('body.can_configure', false);

        $professor = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor', 'status' => 'active']);
        $this->actingAs($professor)->getJson('/api/finance/settings')->assertForbidden();
    }

    public function test_categories_and_cost_centers_require_configure_and_keep_system_ones_active(): void
    {
        $list = $this->actingAs($this->admin)->getJson('/api/finance/payables/categories')->assertOk()->json('body.items');
        $fees = collect($list)->firstWhere('name', 'Tarifas bancárias');
        $this->assertTrue($fees['system_managed']);

        $secretaria = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'secretaria', 'status' => 'active']);
        $this->actingAs($secretaria)->postJson('/api/finance/payables/categories', ['name' => 'Eventos'])->assertForbidden();

        $id = $this->actingAs($this->admin)->postJson('/api/finance/payables/categories', ['name' => 'Eventos'])->assertCreated()->json('body.id');
        $this->actingAs($this->admin)->postJson('/api/finance/payables/categories', ['name' => 'Eventos'])->assertStatus(422);

        Expense::query()->create(['tenant_id' => $this->tenant->id, 'description' => 'Festa junina', 'amount' => 300, 'due_date' => '2026-11-10', 'category_id' => $id]);
        $this->actingAs($this->admin)->putJson("/api/finance/payables/categories/{$id}", ['name' => 'Eventos e festas', 'active' => false])
            ->assertOk()->assertJsonPath('body.active', false);

        $row = collect($this->actingAs($this->admin)->getJson('/api/finance/payables/categories')->json('body.items'))->firstWhere('id', $id);
        $this->assertSame(['Eventos e festas', false, 1], [$row['name'], $row['active'], $row['expenses_count']]);

        // Categoria usada pelo sistema pode ser renomeada, mas não desativada.
        $this->actingAs($this->admin)->putJson("/api/finance/payables/categories/{$fees['id']}", ['name' => 'Tarifas do banco', 'active' => false])
            ->assertOk()->assertJsonPath('body.active', true);
        $this->assertSame(FinanceCategory::BANK_FEES, FinanceCategory::query()->find($fees['id'])->system_key);

        $centers = $this->actingAs($this->admin)->getJson('/api/finance/payables/cost-centers')->assertOk()->json('body.items');
        $this->assertSame(['Administrativo', 'Comercial', 'Pedagógico'], array_column($centers, 'name'));

        $other = Tenant::factory()->create();
        $foreign = FinanceCategory::query()->create(['tenant_id' => $other->id, 'name' => 'Alheia']);
        $this->actingAs($this->admin)->putJson("/api/finance/payables/categories/{$foreign->id}", ['name' => 'Minha'])->assertNotFound();
    }
}
