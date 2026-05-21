<?php

namespace Tests\Unit;

use Database\Seeders\DomainSeeder;
use App\Models\Guardian;
use App\Models\Invoice;
use App\Models\Student;
use App\Models\Tenant;
use App\Services\Asaas\AsaasCredentialService;
use App\Services\Gateways\AsaasPaymentGateway;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AsaasPaymentGatewayTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'asaas.api_key' => '',
            'asaas.base_url' => 'https://api-sandbox.asaas.com/v3',
        ]);
    }

    protected function afterRefreshingDatabase(): void
    {
        $this->seed(DomainSeeder::class);
    }

    public function test_create_charge_pix_fetches_qr_code(): void
    {
        Http::fake([
            'https://api-sandbox.asaas.com/v3/customers' => Http::response([
                'id' => 'cus_test_1',
                'name' => 'Responsável',
            ], 200),
            'https://api-sandbox.asaas.com/v3/payments' => Http::response([
                'id' => 'pay_test_1',
                'status' => 'PENDING',
                'invoiceUrl' => 'https://asaas.com/i/1',
            ], 200),
            'https://api-sandbox.asaas.com/v3/payments/pay_test_1/pixQrCode' => Http::response([
                'payload' => '000201PIX',
                'encodedImage' => 'data:image/png;base64,abc',
            ], 200),
        ]);

        $tenant = Tenant::factory()->create();
        app(AsaasCredentialService::class)->persist(
            $tenant,
            'stage',
            '$aact_test_key_123456789012345',
        );
        $guardian = Guardian::factory()->create([
            'tenant_id' => $tenant->id,
            'document' => '12345678901',
            'email' => 'resp@test.com',
        ]);
        $student = Student::factory()->create(['tenant_id' => $tenant->id]);

        $invoice = Invoice::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $student->id,
            'guardian_id' => $guardian->id,
            'amount' => 150.50,
            'due_date' => now()->addDays(5)->toDateString(),
            'description' => 'Mensalidade teste',
        ]);

        $gateway = app(AsaasPaymentGateway::class);
        $result = $gateway->createCharge($invoice, 'stage', 'pix');

        $this->assertSame('pay_test_1', $result['external_id']);
        $this->assertSame('PENDING', $result['status']);
        $this->assertSame('000201PIX', $result['pix_copy_paste']);
        $this->assertSame('https://asaas.com/i/1', $result['payment_url']);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/payments')
                && ($request['billingType'] ?? null) === 'PIX'
                && ($request['externalReference'] ?? null) !== '';
        });
    }

    public function test_payment_status_mapper_marks_received_as_paid(): void
    {
        $mapper = app(\App\Services\Asaas\AsaasPaymentStatusMapper::class);

        $this->assertSame('paid', $mapper->mapToLocalStatus('RECEIVED'));
        $this->assertSame('paid', $mapper->mapToLocalStatus('CONFIRMED'));
        $this->assertSame('cancelled', $mapper->mapToLocalStatus('REFUNDED'));
    }
}
