<?php

namespace Tests\Feature\Cora;

use App\Models\Invoice;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Cora\CoraPaymentDate;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Data sem horário é o dia em Brasília (03:00 UTC), não meia-noite UTC (21h do dia anterior em Brasília). */
class PaymentDateTimezoneTest extends TestCase
{
    use RefreshDatabase;

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

    private function invoice(array $attrs = []): Invoice
    {
        return Invoice::factory()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $this->tenant->id])->id,
            'amount' => 125,
            'status' => 'pending',
            'due_date' => '2026-11-05',
            'payment_method' => null,
            'cora_charge_id' => null,
            'cora_payload' => null,
        ], $attrs));
    }

    public function test_reads_cora_dates_in_the_right_timezone(): void
    {
        $utc = fn (array $payload) => CoraPaymentDate::fromInvoice($payload)?->utc()->toDateTimeString();

        $this->assertSame('2026-11-03 03:00:00', $utc(['occurrence_date' => '2026-11-03']));
        $this->assertSame('2026-11-03 11:41:00', $utc(['paid_at' => '2026-11-03T08:41:00-03:00']));
        $this->assertSame('2026-11-03 19:27:52', $utc(['payments' => [['finalized_at' => '2026-11-03T19:27:52Z']]]));
        // Mesma ordem de antes: o dia do pagamento no banco vem antes do horário de compensação.
        $this->assertSame('2026-11-03 03:00:00', $utc(['occurrence_date' => '2026-11-03', 'payments' => [['finalized_at' => '2026-11-04T10:00:00Z']]]));
        $this->assertNull($utc([]));
    }

    public function test_cora_settlement_with_date_only_keeps_the_payment_day(): void
    {
        $invoice = $this->invoice([
            'payment_method' => 'bank_slip',
            'cora_charge_id' => 'inv_novembro',
            'cora_payload' => ['integration' => ['provider' => 'cora', 'environment' => 'stage']],
        ]);
        Http::fake(['https://api.stage.cora.com.br/v2/invoices/*' => Http::response([
            'id' => 'inv_novembro', 'status' => 'PAID', 'occurrence_date' => '2026-11-03',
        ])]);

        $this->actingAs($this->admin)->getJson("/api/invoices/{$invoice->id}/charge-status")->assertOk();

        $paidAt = $invoice->refresh()->paid_at;
        $this->assertSame('2026-11-03 03:00:00', $paidAt->utc()->toDateTimeString());
        $this->assertSame('03/11/2026', $paidAt->copy()->setTimezone('America/Sao_Paulo')->format('d/m/Y'));
    }

    public function test_manual_settlement_date_is_the_day_in_brasilia(): void
    {
        $invoice = $this->invoice(['amount' => 175]);

        $this->actingAs($this->admin)->postJson("/api/invoices/{$invoice->id}/mark-as-paid", [
            'paid_at' => '2026-08-12',
            'payment_method' => 'cash',
        ])->assertOk();

        $this->assertSame('2026-08-12 03:00:00', $invoice->refresh()->paid_at->utc()->toDateTimeString());
    }
}
