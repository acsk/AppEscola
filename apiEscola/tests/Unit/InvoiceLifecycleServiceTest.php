<?php

namespace Tests\Unit;

use App\Models\Invoice;
use App\Services\InvoiceLifecycleService;
use App\Services\PaymentGatewayFactory;
use Mockery;
use Tests\TestCase;

class InvoiceLifecycleServiceTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_paid_invoice_cannot_cancel_or_delete(): void
    {
        $invoice = new Invoice(['status' => 'paid', 'cora_charge_id' => 'chg_1']);

        $service = new InvoiceLifecycleService(Mockery::mock(PaymentGatewayFactory::class));
        $permissions = $service->permissions($invoice);

        $this->assertFalse($permissions['can_cancel']);
        $this->assertFalse($permissions['can_delete']);
        $this->assertStringContainsString('paga', (string) $permissions['cancel_block_reason']);
    }

    public function test_active_boleto_requires_cancel_before_delete(): void
    {
        $invoice = new Invoice([
            'status' => 'pending',
            'payment_method' => 'boleto',
            'cora_charge_id' => 'chg_1',
            'cora_status' => 'OPEN',
        ]);

        $service = new InvoiceLifecycleService(Mockery::mock(PaymentGatewayFactory::class));
        $permissions = $service->permissions($invoice);

        $this->assertTrue($permissions['can_cancel']);
        $this->assertFalse($permissions['can_delete']);
        $this->assertTrue($permissions['requires_cora_cancel_before_delete']);
    }

    public function test_cancelled_invoice_can_delete(): void
    {
        $invoice = new Invoice([
            'status' => 'cancelled',
            'cora_charge_id' => 'chg_1',
            'cora_status' => 'CANCELLED',
        ]);

        $service = new InvoiceLifecycleService(Mockery::mock(PaymentGatewayFactory::class));
        $permissions = $service->permissions($invoice);

        $this->assertFalse($permissions['can_cancel']);
        $this->assertTrue($permissions['can_delete']);
    }

    public function test_active_pix_blocks_cancel_and_delete(): void
    {
        $invoice = new Invoice([
            'status' => 'pending',
            'payment_method' => 'pix',
            'cora_charge_id' => 'chg_pix',
            'cora_status' => 'OPEN',
        ]);

        $service = new InvoiceLifecycleService(Mockery::mock(PaymentGatewayFactory::class));
        $permissions = $service->permissions($invoice);

        $this->assertFalse($permissions['can_cancel']);
        $this->assertFalse($permissions['can_delete']);
    }

    public function test_local_pending_without_gateway_can_delete(): void
    {
        $invoice = new Invoice([
            'status' => 'pending',
            'payment_method' => null,
            'cora_charge_id' => null,
        ]);

        $service = new InvoiceLifecycleService(Mockery::mock(PaymentGatewayFactory::class));
        $permissions = $service->permissions($invoice);

        $this->assertTrue($permissions['can_cancel']);
        $this->assertTrue($permissions['can_delete']);
        $this->assertFalse($permissions['requires_cora_cancel_before_delete']);
    }
}
