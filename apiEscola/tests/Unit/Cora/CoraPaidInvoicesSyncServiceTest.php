<?php

namespace Tests\Unit;

use App\Models\Invoice;
use App\Models\Tenant;
use App\Services\CoraPaidInvoicesSyncService;
use App\Services\InvoicePaymentSettingsResolver;
use App\Services\PaymentGatewayFactory;
use Mockery;
use ReflectionMethod;
use Tests\TestCase;

class CoraPaidInvoicesSyncServiceTest extends TestCase
{
    private function invokePrivate(object $object, string $method, mixed ...$args): mixed
    {
        $reflection = new ReflectionMethod($object, $method);
        $reflection->setAccessible(true);

        return $reflection->invoke($object, ...$args);
    }

    public function test_marks_invoice_paid_from_cora_payload_in_dry_run_path(): void
    {
        $service = new CoraPaidInvoicesSyncService(
            Mockery::mock(PaymentGatewayFactory::class),
            Mockery::mock(InvoicePaymentSettingsResolver::class),
        );

        $invoice = new Invoice([
            'status' => 'pending',
            'payment_method' => 'bank_slip',
            'cora_payload' => [],
        ]);

        $outcome = $this->invokePrivate($service, 'applyExternalStatus', $invoice, [
            'status' => 'PAID',
            'occurrence_date' => '2026-07-02',
            'payments' => [
                ['method' => 'BANK_SLIP', 'finalized_at' => '2026-07-02T11:24:45Z'],
            ],
        ], true);

        $this->assertSame('paid', $outcome);
    }

    public function test_marks_invoice_cancelled_from_expired_status(): void
    {
        $service = new CoraPaidInvoicesSyncService(
            Mockery::mock(PaymentGatewayFactory::class),
            Mockery::mock(InvoicePaymentSettingsResolver::class),
        );

        $invoice = new Invoice([
            'status' => 'pending',
            'cora_payload' => [],
        ]);

        $outcome = $this->invokePrivate($service, 'applyExternalStatus', $invoice, [
            'status' => 'EXPIRED',
        ], true);

        $this->assertSame('cancelled', $outcome);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
