<?php

namespace Tests\Unit;

use App\Models\Invoice;
use App\Services\CoraTokenService;
use App\Services\Gateways\CoraPaymentGateway;
use PHPUnit\Framework\Attributes\Test;
use ReflectionMethod;
use RuntimeException;
use Tests\TestCase;

class CoraPaymentGatewayChargeValidationTest extends TestCase
{
    private function invokePrivate(object $object, string $method, mixed ...$args): mixed
    {
        $reflection = new ReflectionMethod($object, $method);
        $reflection->setAccessible(true);

        return $reflection->invoke($object, ...$args);
    }

    #[Test]
    public function it_converts_invoice_amount_to_cents(): void
    {
        $gateway = new CoraPaymentGateway($this->createMock(CoraTokenService::class));
        $invoice = new Invoice(['amount' => '10.50']);

        $cents = $this->invokePrivate($gateway, 'resolveServiceAmountInCents', $invoice);

        $this->assertSame(1050, $cents);
    }

    #[Test]
    public function it_rejects_amount_below_cora_minimum(): void
    {
        $gateway = new CoraPaymentGateway($this->createMock(CoraTokenService::class));
        $invoice = new Invoice(['amount' => '4.99']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('no mínimo R$ 5,00');

        $this->invokePrivate($gateway, 'assertChargeableInvoice', $invoice, '12345678901');
    }

    #[Test]
    public function it_rejects_missing_payer_document(): void
    {
        $gateway = new CoraPaymentGateway($this->createMock(CoraTokenService::class));
        $invoice = new Invoice(['amount' => '50.00']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('CPF (11 dígitos) ou CNPJ (14 dígitos)');

        $this->invokePrivate($gateway, 'assertChargeableInvoice', $invoice, '');
    }

    #[Test]
    public function it_truncates_long_service_description(): void
    {
        $gateway = new CoraPaymentGateway($this->createMock(CoraTokenService::class));
        $longText = str_repeat('A', 120);

        $result = $this->invokePrivate($gateway, 'truncateServiceDescription', $longText);

        $this->assertSame(100, mb_strlen($result));
    }
}
