<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\InvoiceAuditLog;
use App\Models\Student;
use App\Models\Tenant;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FixMidnightPaidAtCommandTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $this->tenant = Tenant::factory()->create();
    }

    private function invoice(array $attrs): Invoice
    {
        return Invoice::factory()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $this->tenant->id])->id,
            'amount' => 125,
            'status' => 'paid',
            'due_date' => '2026-11-05',
            'payment_method' => 'bank_slip',
        ], $attrs));
    }

    public function test_lists_by_default_and_fixes_only_midnight_utc_with_audit(): void
    {
        $cora = $this->invoice(['paid_at' => '2026-11-03 00:00:00', 'cora_charge_id' => 'inv_novembro']);
        $manual = $this->invoice(['paid_at' => '2026-08-12 00:00:00', 'payment_method' => 'cash']);
        $withTime = $this->invoice(['paid_at' => '2026-11-03 11:41:00', 'cora_charge_id' => 'inv_pix']);
        $pending = $this->invoice(['status' => 'pending', 'paid_at' => null]);

        $this->artisan('invoices:fix-midnight-paid-at')
            ->expectsOutputToContain('2 cobrança(s) seriam corrigidas')
            ->assertSuccessful();
        $this->assertSame('2026-11-03 00:00:00', $cora->refresh()->paid_at->utc()->toDateTimeString());

        $this->artisan('invoices:fix-midnight-paid-at --apply')
            ->expectsConfirmation('Corrigir 2 cobrança(s)?', 'no')
            ->expectsOutputToContain('Cancelado')
            ->assertSuccessful();
        $this->assertSame('2026-11-03 00:00:00', $cora->refresh()->paid_at->utc()->toDateTimeString());

        $this->artisan('invoices:fix-midnight-paid-at --apply --force')
            ->expectsOutputToContain('2 cobrança(s) corrigida(s)')
            ->assertSuccessful();

        $this->assertSame('2026-11-03 03:00:00', $cora->refresh()->paid_at->utc()->toDateTimeString());
        $this->assertSame('03/11/2026', $cora->paid_at->copy()->setTimezone('America/Sao_Paulo')->format('d/m/Y'));
        $this->assertSame('2026-08-12 03:00:00', $manual->refresh()->paid_at->utc()->toDateTimeString());
        $this->assertSame('2026-11-03 11:41:00', $withTime->refresh()->paid_at->utc()->toDateTimeString());
        $this->assertNull($pending->refresh()->paid_at);

        $log = InvoiceAuditLog::where('invoice_id', $cora->id)->where('action', 'updated')->sole();
        $this->assertSame('system', $log->source);
        $this->assertStringContainsString('Correção de fuso', $log->reason);
        $this->assertArrayHasKey('paid_at', $log->changes);

        // Rodar de novo não mexe em nada (não soma mais 3 h).
        $this->artisan('invoices:fix-midnight-paid-at --apply --force')
            ->expectsOutputToContain('Nenhuma cobrança')
            ->assertSuccessful();
        $this->assertSame('2026-11-03 03:00:00', $cora->refresh()->paid_at->utc()->toDateTimeString());
    }
}
