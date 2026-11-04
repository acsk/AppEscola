<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\InvoiceAuditLog;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class InvoiceAuditTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    private function setUpTenant(): array
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $student = Student::factory()->create(['tenant_id' => $tenant->id]);

        return [$tenant, $admin, $student];
    }

    public function test_full_lifecycle_is_recorded_with_author_and_diff(): void
    {
        [$tenant, $admin, $student] = $this->setUpTenant();

        $id = $this->actingAs($admin)->postJson('/api/invoices', [
            'student_id' => $student->id,
            'description' => 'Mensalidade 4/5',
            'amount' => 175,
            'due_date' => '2026-10-20',
            'status' => 'pending',
        ])->assertCreated()->json('id');

        $this->actingAs($admin)->putJson("/api/invoices/{$id}", [
            'due_date' => '2026-10-25',
            'amount' => 180,
            'edit_reason' => 'Acordo com o responsável',
        ])->assertOk();

        $this->actingAs($admin)->postJson("/api/invoices/{$id}/mark-as-paid", [
            'payment_method' => 'cash',
            'paid_at' => '2026-10-24',
        ])->assertOk();

        $items = $this->actingAs($admin)->getJson("/api/invoices/{$id}/audit")->assertOk()->json('body.items');

        $this->assertSame(['paid', 'updated', 'created'], array_column($items, 'action'));
        $this->assertSame('user', $items[0]['source']);
        $this->assertSame($admin->id, $items[0]['user']['id']);
        // O MySQL reordena as chaves do JSON: compara {from, to} sem depender da ordem.
        $this->assertEquals(['from' => 'pending', 'to' => 'paid'], $items[0]['changes']['status']);
        $this->assertSame('cash', $items[0]['changes']['payment_method']['to']);
        $this->assertEquals(['from' => '2026-10-20', 'to' => '2026-10-25'], $items[1]['changes']['due_date']);
        $this->assertEquals(['from' => '175.00', 'to' => '180.00'], $items[1]['changes']['amount']);
        $this->assertSame('Acordo com o responsável', $items[1]['reason']);
        $this->assertSame('175.00', $items[2]['changes']['amount']['to']);
    }

    public function test_system_changes_are_recorded_and_technical_fields_ignored(): void
    {
        [$tenant, , $student] = $this->setUpTenant();
        Auth::logout();

        $invoice = Invoice::factory()->create(['tenant_id' => $tenant->id, 'student_id' => $student->id, 'status' => 'pending']);
        // Só carimbo de sincronização: não gera evento.
        $invoice->update(['cora_last_synced_at' => now(), 'cora_payload' => ['x' => 1]]);
        // Baixa vinda da sincronização (sem usuário).
        $invoice->update(['status' => 'paid', 'paid_at' => now(), 'payment_method' => 'pix']);
        $invoice->delete();

        $logs = InvoiceAuditLog::where('invoice_id', $invoice->id)->orderBy('id')->get();
        $this->assertSame(['created', 'paid', 'deleted'], $logs->pluck('action')->all());
        $this->assertSame(['system'], $logs->pluck('source')->unique()->values()->all());
        $this->assertNull($logs[1]->user_id);
    }

    public function test_audit_is_scoped_to_tenant_and_finance_permission(): void
    {
        [$tenant, , $student] = $this->setUpTenant();
        $invoice = Invoice::factory()->create(['tenant_id' => $tenant->id, 'student_id' => $student->id]);

        [, $otherAdmin] = $this->setUpTenant();
        $this->actingAs($otherAdmin)->getJson("/api/invoices/{$invoice->id}/audit")->assertForbidden();

        $professor = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'professor', 'status' => 'active']);
        $this->actingAs($professor)->getJson("/api/invoices/{$invoice->id}/audit")->assertForbidden();
    }
}
