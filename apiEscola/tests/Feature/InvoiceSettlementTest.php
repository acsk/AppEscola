<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InvoiceSettlementTest extends TestCase
{
    use RefreshDatabase;

    public function test_mark_as_paid_requires_payment_method(): void
    {
        [$user, $invoice] = $this->seedPendingInvoice();

        Sanctum::actingAs($user);

        $this->postJson("/api/invoices/{$invoice->id}/mark-as-paid", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['payment_method']);
    }

    public function test_mark_as_paid_with_cash_setstlement(): void
    {
        [$user, $invoice] = $this->seedPendingInvoice();

        Sanctum::actingAs($user);

        $this->postJson("/api/invoices/{$invoice->id}/mark-as-paid", [
            'payment_method' => 'cash',
            'paid_at' => '2026-05-20',
            'notes' => 'Recepção',
        ])
            ->assertOk()
            ->assertJsonPath('body.invoice.status', 'paid')
            ->assertJsonPath('body.invoice.payment_method', 'cash')
            ->assertJsonPath('body.invoice.notes', 'Recepção');

        $this->assertDatabaseHas('invoices', [
            'id' => $invoice->id,
            'status' => 'paid',
            'payment_method' => 'cash',
        ]);
    }

    public function test_mark_as_paid_credit_card_requires_reference(): void
    {
        [$user, $invoice] = $this->seedPendingInvoice();

        Sanctum::actingAs($user);

        $this->postJson("/api/invoices/{$invoice->id}/mark-as-paid", [
            'payment_method' => 'credit_card',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['payment_reference']);

        $this->postJson("/api/invoices/{$invoice->id}/mark-as-paid", [
            'payment_method' => 'credit_card',
            'payment_reference' => 'NSU 123456',
        ])
            ->assertOk()
            ->assertJsonPath('body.invoice.payment_reference', 'NSU 123456');
    }

    public function test_invoices_summary_returns_totals(): void
    {
        [$user, $invoice] = $this->seedPendingInvoice();

        Sanctum::actingAs($user);

        $this->postJson("/api/invoices/{$invoice->id}/mark-as-paid", [
            'payment_method' => 'pix',
            'paid_at' => now()->toDateString(),
        ])->assertOk();

        $response = $this->getJson('/api/invoices/summary?paid_at_from=' . now()->toDateString())
            ->assertOk();

        $response->assertJsonPath('paid_in_period.count', 1);
        $response->assertJsonStructure([
            'open',
            'overdue',
            'paid_in_period',
            'by_payment_method',
            'period',
        ]);
    }

    /**
     * @return array{0: User, 1: Invoice}
     */
    private function seedPendingInvoice(): array
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $student = Student::factory()->create(['tenant_id' => $tenant->id]);

        $invoice = Invoice::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $student->id,
            'status' => 'pending',
            'amount' => 150.00,
            'due_date' => now()->addDays(5),
        ]);

        return [$user, $invoice];
    }
}
