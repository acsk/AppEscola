<?php

namespace Tests\Unit;

use App\Models\Invoice;
use App\Services\InvoiceLifecycleService;
use App\Services\InvoicePaymentSettingsResolver;
use App\Services\PaymentGatewayFactory;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class InvoiceLifecycleServiceTest extends TestCase
{
    private function makeService(): InvoiceLifecycleService
    {
        return new InvoiceLifecycleService(
            Mockery::mock(PaymentGatewayFactory::class),
            Mockery::mock(InvoicePaymentSettingsResolver::class),
        );
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_paid_invoice_cannot_cancel_or_delete(): void
    {
        $invoice = new Invoice(['status' => 'paid', 'cora_charge_id' => 'chg_1']);

        $service = $this->makeService();
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

        $service = $this->makeService();
        $permissions = $service->permissions($invoice);

        $this->assertTrue($permissions['can_cancel']);
        $this->assertFalse($permissions['can_delete']);
        $this->assertTrue($permissions['requires_cora_cancel_before_delete']);
    }

    public function test_cancelled_invoice_with_provider_cannot_delete(): void
    {
        $invoice = new Invoice([
            'status' => 'cancelled',
            'cora_charge_id' => 'chg_1',
            'cora_status' => 'CANCELLED',
        ]);

        $service = $this->makeService();
        $permissions = $service->permissions($invoice);

        $this->assertFalse($permissions['can_cancel']);
        $this->assertFalse($permissions['can_delete']);
        $this->assertFalse($permissions['is_local_invoice']);
    }

    public function test_cancelled_local_invoice_can_delete(): void
    {
        $invoice = new Invoice([
            'status' => 'cancelled',
            'cora_charge_id' => null,
        ]);

        $service = $this->makeService();
        $permissions = $service->permissions($invoice);

        $this->assertFalse($permissions['can_cancel']);
        $this->assertTrue($permissions['can_delete']);
        $this->assertTrue($permissions['is_local_invoice']);
    }

    public function test_cora_sync_imported_invoice_cannot_delete(): void
    {
        $invoice = new Invoice([
            'status' => 'pending',
            'cora_payload' => ['integration' => ['origin' => 'cora_sync']],
        ]);

        $service = $this->makeService();
        $permissions = $service->permissions($invoice);

        $this->assertFalse($permissions['can_delete']);
        $this->assertFalse($permissions['is_local_invoice']);
        $this->assertStringContainsString('Cora', (string) $permissions['delete_block_reason']);
    }

    public function test_active_pix_requires_cancel_before_delete(): void
    {
        $invoice = new Invoice([
            'status' => 'pending',
            'payment_method' => 'pix',
            'cora_charge_id' => 'chg_pix',
            'cora_status' => 'OPEN',
        ]);

        $service = $this->makeService();
        $permissions = $service->permissions($invoice);

        $this->assertTrue($permissions['can_cancel']);
        $this->assertFalse($permissions['can_delete']);
        $this->assertTrue($permissions['requires_cora_cancel_before_delete']);
        $this->assertTrue($service->shouldCancelOnGateway($invoice));
    }

    public function test_local_pending_without_gateway_can_delete(): void
    {
        $invoice = new Invoice([
            'status' => 'pending',
            'payment_method' => null,
            'cora_charge_id' => null,
        ]);

        $service = $this->makeService();
        $permissions = $service->permissions($invoice);

        $this->assertTrue($permissions['can_cancel']);
        $this->assertTrue($permissions['can_delete']);
        $this->assertTrue($permissions['is_local_invoice']);
        $this->assertFalse($permissions['requires_cora_cancel_before_delete']);
    }

    public function test_pending_with_generated_charge_cannot_edit(): void
    {
        $invoice = new Invoice([
            'status' => 'pending',
            'cora_charge_id' => 'inv_abc',
            'cora_status' => 'OPEN',
            'cora_payment_url' => 'https://example.com/boleto.pdf',
        ]);

        $service = $this->makeService();
        $permissions = $service->permissions($invoice);

        $this->assertFalse($permissions['can_edit']);
        $this->assertStringContainsString('boleto ou PIX', (string) $permissions['edit_block_reason']);
        $this->assertTrue($service->hasGeneratedPaymentCharge($invoice));
    }

    public function test_pending_with_pix_only_assets_cannot_edit(): void
    {
        $invoice = new Invoice([
            'status' => 'overdue',
            'cora_pix_copy_paste' => '00020126',
        ]);

        $service = $this->makeService();
        $permissions = $service->permissions($invoice);

        $this->assertFalse($permissions['can_edit']);
    }

    public function test_pending_without_generated_charge_can_edit(): void
    {
        $invoice = new Invoice([
            'status' => 'pending',
            'cora_charge_id' => null,
        ]);

        $service = $this->makeService();
        $permissions = $service->permissions($invoice);

        $this->assertTrue($permissions['can_edit']);
        $this->assertNull($permissions['edit_block_reason']);
    }

    public function test_assert_can_edit_throws_when_charge_generated(): void
    {
        $invoice = new Invoice([
            'status' => 'pending',
            'cora_charge_id' => 'inv_abc',
        ]);

        $service = $this->makeService();

        $this->expectException(RuntimeException::class);
        $service->assertCanEdit($invoice);
    }
}
