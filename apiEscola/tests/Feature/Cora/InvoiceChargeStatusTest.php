<?php

namespace Tests\Feature\Cora;

use App\Models\Invoice;
use App\Models\InvoiceAuditLog;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** GET invoices/{id}/charge-status: mesma regra segura do webhook, mesmo contrato de resposta. */
class InvoiceChargeStatusTest extends TestCase
{
    use RefreshDatabase;

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

    private function coraInvoice(string $chargeId, array $attrs = []): Invoice
    {
        return Invoice::factory()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $this->tenant->id])->id,
            'amount' => 175,
            'status' => 'pending',
            'due_date' => '2026-10-20',
            'payment_method' => 'pix',
            'cora_charge_id' => $chargeId,
            'cora_payload' => ['integration' => ['provider' => 'cora', 'environment' => 'stage']],
        ], $attrs));
    }

    public function test_paid_on_cora_settles_with_correct_time_and_keeps_response_contract(): void
    {
        $invoice = $this->coraInvoice('inv_pago');
        Http::fake([self::CORA_INVOICE_URL => Http::response(['id' => 'inv_pago', 'status' => 'PAID', 'paid_at' => '2026-10-19T14:30:00-03:00'])]);

        $this->actingAs($this->admin)->getJson("/api/invoices/{$invoice->id}/charge-status")
            ->assertOk()
            ->assertJsonPath('body.provider', 'cora')
            ->assertJsonPath('body.status', 'PAID')
            ->assertJsonPath('body.paid_at', '2026-10-19T17:30:00.000000Z');

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertSame('2026-10-19 17:30:00', $invoice->paid_at->utc()->toDateTimeString());

        $log = InvoiceAuditLog::where('invoice_id', $invoice->id)->where('action', 'paid')->sole();
        $this->assertSame('user', $log->source);
        $this->assertSame($this->admin->id, $log->user_id);
    }

    public function test_late_cancel_on_cora_does_not_reopen_paid_invoice(): void
    {
        $invoice = $this->coraInvoice('inv_quitado', ['status' => 'paid', 'paid_at' => '2026-10-19 10:00:00']);
        Http::fake([self::CORA_INVOICE_URL => Http::response(['id' => 'inv_quitado', 'status' => 'CANCELLED'])]);

        $this->actingAs($this->admin)->getJson("/api/invoices/{$invoice->id}/charge-status")->assertOk();

        $this->assertSame('paid', $invoice->refresh()->status);
    }

    public function test_cora_returning_another_charge_changes_nothing(): void
    {
        $invoice = $this->coraInvoice('inv_certo');
        Http::fake([self::CORA_INVOICE_URL => Http::response(['id' => 'inv_outro', 'status' => 'PAID'])]);

        $this->actingAs($this->admin)->getJson("/api/invoices/{$invoice->id}/charge-status")->assertStatus(422);

        $invoice->refresh();
        $this->assertSame('pending', $invoice->status);
        $this->assertNull($invoice->cora_last_synced_at);
    }

    public function test_cora_unavailable_returns_error_without_changes(): void
    {
        $invoice = $this->coraInvoice('inv_fora');
        Http::fake([self::CORA_INVOICE_URL => Http::response(['message' => 'indisponível'], 500)]);

        $this->actingAs($this->admin)->getJson("/api/invoices/{$invoice->id}/charge-status")->assertStatus(502);

        $this->assertSame('pending', $invoice->refresh()->status);
    }
}
