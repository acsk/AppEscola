<?php

namespace Tests\Feature\Cora;

use App\Models\BankStatementEntry;
use App\Models\Invoice;
use App\Models\Student;
use App\Models\Tenant;
use App\Services\Cora\CoraTransactionId;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** cora:check-payment-link só lê: liga trx_ do extrato a payments[].id da cobrança e não grava nada. */
class CheckCoraPaymentLinkCommandTest extends TestCase
{
    use RefreshDatabase;

    /** trx_ real do extrato e o UUID que ele representa. */
    private const TRX = 'trx_YWeX0kbdSvyZi5fFC3umxQ';

    private const PAYMENT_UUID = '616797d2-46dd-4afc-998b-97c50b7ba6c5';

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        config(['services.cora.token' => 'token-de-teste', 'services.cora.api_base_url_prod' => 'https://api.cora.com.br']);
        $this->tenant = Tenant::factory()->create();
    }

    private function paidInvoice(array $payload): Invoice
    {
        return Invoice::factory()->create([
            'tenant_id' => $this->tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $this->tenant->id])->id,
            'amount' => 170,
            'status' => 'paid',
            'paid_at' => '2026-11-04 11:45:34',
            'due_date' => '2026-11-05',
            'cora_charge_id' => 'inv_app',
            'cora_payload' => array_replace_recursive(['integration' => ['provider' => 'cora', 'environment' => 'prod']], $payload),
            'created_at' => '2026-06-01 12:00:00',
        ]);
    }

    private function entry(): BankStatementEntry
    {
        return BankStatementEntry::create([
            'tenant_id' => $this->tenant->id,
            'environment' => 'prod',
            'source' => 'cora',
            'external_id' => 'ent_11etFnYkSbWCfoOGEEBXxw',
            'transaction_id' => self::TRX,
            'direction' => 'credit',
            'transaction_type' => 'PAYMENT',
            'amount' => '170.00',
            'occurred_at' => '2026-11-04 11:45:34',
            'status' => 'pending',
        ]);
    }

    public function test_decodes_cora_ids_including_escaped_ones(): void
    {
        $this->assertSame([self::PAYMENT_UUID], CoraTransactionId::uuidCandidates(self::TRX));
        $this->assertContains('ad5bd186-9fe5-45e9-9c30-3aee328df038', CoraTransactionId::uuidCandidates('trx_rVvRhp91lRemcMDruMo3wOA'));
        $this->assertNotEmpty(CoraTransactionId::uuidCandidates('trx_N91996u91eqRDGBOZ6T8Dy99cQ'));
        $this->assertSame([], CoraTransactionId::uuidCandidates('texto qualquer'));
    }

    public function test_reports_link_from_stored_payment_without_writing(): void
    {
        $invoice = $this->paidInvoice(['payments' => [['id' => strtoupper(self::PAYMENT_UUID), 'total_paid' => 17000]]]);
        $entry = $this->entry();
        Http::fake();

        $this->artisan('cora:check-payment-link')
            ->expectsOutputToContain('A ligação pelo ID é viável')
            ->expectsOutputToContain('Nada foi gravado.')
            ->assertSuccessful();

        Http::assertNothingSent();
        $this->assertSame('pending', $entry->refresh()->status);
        $this->assertNull($entry->invoice_id);
        $this->assertSame('paid', $invoice->refresh()->status);
    }

    public function test_fetch_reads_payment_from_cora_and_ignores_imported_invoices(): void
    {
        $this->paidInvoice([]);
        Invoice::factory()->create([
            'tenant_id' => $this->tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $this->tenant->id])->id,
            'amount' => 170,
            'status' => 'paid',
            'cora_charge_id' => 'inv_importada',
            'cora_payload' => ['integration' => ['origin' => 'cora_sync'], 'payments' => [['id' => self::PAYMENT_UUID]]],
        ]);
        $this->entry();

        $this->artisan('cora:check-payment-link')
            ->expectsOutputToContain('Rode de novo com --fetch')
            ->assertSuccessful();

        Http::fake(['https://api.cora.com.br/v2/invoices/inv_app' => Http::response([
            'id' => 'inv_app', 'status' => 'PAID', 'payments' => [['id' => self::PAYMENT_UUID]],
        ])]);

        $this->artisan('cora:check-payment-link --fetch')
            ->expectsOutputToContain('A ligação pelo ID é viável')
            ->assertSuccessful();

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request->method() === 'GET');
    }
}
