<?php

namespace Tests\Unit;

use App\Models\Invoice;
use App\Services\CoraTokenService;
use App\Services\Gateways\CoraPaymentGateway;
use Illuminate\Support\Carbon;
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
    public function it_rejects_invalid_length_payer_document(): void
    {
        $gateway = new CoraPaymentGateway($this->createMock(CoraTokenService::class));
        $invoice = new Invoice(['amount' => '50.00']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Documento informado tem 9 dígito(s).');

        $this->invokePrivate($gateway, 'assertChargeableInvoice', $invoice, '080425184', 'A MÃE');
    }

    #[Test]
    public function it_prefers_financial_guardian_with_valid_document_when_invoice_guardian_is_invalid(): void
    {
        $gateway = new CoraPaymentGateway($this->createMock(CoraTokenService::class));

        $invalidGuardian = new \App\Models\Guardian([
            'id' => 16,
            'name' => 'A MÃE',
            'document' => '080425184',
        ]);
        $validGuardian = new \App\Models\Guardian([
            'id' => 138,
            'name' => 'ANYELLE PEREIRA BISPO',
            'document' => '07517879499',
        ]);
        $validGuardian->setRelation('pivot', (object) ['is_financial_responsible' => true]);

        $student = new \App\Models\Student(['is_minor' => true]);
        $student->setRelation('guardians', collect([$validGuardian]));

        $invoice = new Invoice();
        $invoice->setRelation('guardian', $invalidGuardian);
        $invoice->setRelation('student', $student);

        $resolved = $this->invokePrivate($gateway, 'resolvePayerGuardian', $invoice);

        $this->assertSame(138, $resolved?->id);
    }

    #[Test]
    public function it_truncates_long_service_description(): void
    {
        $gateway = new CoraPaymentGateway($this->createMock(CoraTokenService::class));
        $longText = str_repeat('A', 120);

        $result = $this->invokePrivate($gateway, 'truncateServiceDescription', $longText);

        $this->assertSame(100, mb_strlen($result));
    }

    #[Test]
    public function it_keeps_future_due_date_for_provider_payload(): void
    {
        Carbon::setTestNow('2026-06-16 12:00:00');

        $gateway = new CoraPaymentGateway($this->createMock(CoraTokenService::class));
        $invoice = new Invoice(['due_date' => '2026-07-15']);

        $resolution = $gateway->resolveProviderDueDateResolution($invoice);

        $this->assertSame('2026-07-15', $resolution['local_due_date']);
        $this->assertSame('2026-07-15', $resolution['provider_due_date']);
        $this->assertFalse($resolution['adjusted']);

        Carbon::setTestNow();
    }

    #[Test]
    public function it_adjusts_past_due_date_to_tomorrow_for_cora_minimum(): void
    {
        Carbon::setTestNow('2026-06-16 12:00:00');

        $gateway = new CoraPaymentGateway($this->createMock(CoraTokenService::class));
        $invoice = new Invoice(['due_date' => '2026-05-27']);

        $resolution = $gateway->resolveProviderDueDateResolution($invoice);

        $this->assertSame('2026-05-27', $resolution['local_due_date']);
        $this->assertSame('2026-06-17', $resolution['provider_due_date']);
        $this->assertTrue($resolution['adjusted']);

        Carbon::setTestNow();
    }

    #[Test]
    public function it_extracts_provider_due_date_from_cora_payload(): void
    {
        $gateway = new CoraPaymentGateway($this->createMock(CoraTokenService::class));

        $dueDate = $gateway->extractDueDateFromCoraPayload([
            'payment_terms' => ['due_date' => '2026-06-17'],
        ]);

        $this->assertSame('2026-06-17', $dueDate);
    }
}
