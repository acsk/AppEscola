<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\PaymentWebhookEvent;
use App\Models\Student;
use App\Models\Tenant;
use App\Services\Asaas\AsaasCredentialService;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Isolamento multi-tenant e autenticidade do webhook Asaas.
 * A API do Asaas é simulada por Http::fake: cada API key só enxerga as cobranças da própria conta.
 */
class AsaasWebhookSecurityTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN_A = 'token-escola-a-0123456789abcdef0123456789';

    private const TOKEN_B = 'token-escola-b-0123456789abcdef0123456789';

    private const KEY_A = '$aact_key_escola_a_1234567890';

    private const KEY_B = '$aact_key_escola_b_1234567890';

    private Tenant $tenantA;

    private Tenant $tenantB;

    /** @var array<string, array<string, array<string, mixed>>> cobranças por API key */
    private array $asaasAccounts = [];

    private bool $asaasDown = false;

    protected function afterRefreshingDatabase(): void
    {
        $this->seed(DomainSeeder::class);
    }

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'asaas.api_key' => '',
            'asaas.webhook_token' => '',
            'asaas.webhook_allow_global_token' => false,
            'asaas.retry.times' => 0,
        ]);

        $credentials = app(AsaasCredentialService::class);
        $this->tenantA = Tenant::factory()->create();
        $this->tenantB = Tenant::factory()->create();
        $credentials->persist($this->tenantA, 'stage', self::KEY_A, self::TOKEN_A);
        $credentials->persist($this->tenantB, 'stage', self::KEY_B, self::TOKEN_B);

        Http::fake(function (HttpRequest $request) {
            if ($this->asaasDown) {
                throw new ConnectionException('timeout');
            }

            $key = $request->header('access_token')[0] ?? '';
            $paymentId = basename(parse_url($request->url(), PHP_URL_PATH));
            $payment = $this->asaasAccounts[$key][$paymentId] ?? null;

            return $payment
                ? Http::response($payment, 200)
                : Http::response(['errors' => [['code' => 'not_found']]], 404);
        });
    }

    // ── Autenticação ─────────────────────────────────────────────────────

    public function test_tenant_processes_own_valid_payment(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED');

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)
            ->assertOk()
            ->assertExactJson(['received' => true]);

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertNotNull($invoice->paid_at);
        $this->assertSame($this->tenantA->id, PaymentWebhookEvent::query()->sole()->tenant_id);
    }

    public function test_invalid_token_is_rejected(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED');

        $this->webhook('token-que-nao-existe-0123456789abcdef', 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)->assertUnauthorized();
        $this->webhook(null, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)->assertUnauthorized();

        $this->assertSame('pending', $invoice->fresh()->status);
        $this->assertSame(0, PaymentWebhookEvent::query()->count());
    }

    public function test_revoked_token_is_rejected(): void
    {
        $this->tenantA->asaasCredentials()->update(['active' => false]);
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED');

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)->assertUnauthorized();
        $this->assertSame('pending', $invoice->fresh()->status);
    }

    public function test_inactive_or_deleted_tenant_is_rejected(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED');

        $this->tenantA->update(['status' => 'suspended']);
        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)->assertUnauthorized();

        $this->tenantA->update(['status' => 'active']);
        $this->tenantA->delete();
        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)->assertUnauthorized();

        $this->assertSame('pending', $invoice->fresh()->status);
    }

    public function test_global_token_does_not_authorize_changes_by_default(): void
    {
        config(['asaas.webhook_token' => 'global-token-0123456789abcdef0123456789']);
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED');

        $this->webhook('global-token-0123456789abcdef0123456789', 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)
            ->assertUnauthorized();

        $this->assertSame('pending', $invoice->fresh()->status);
    }

    public function test_legacy_global_token_cannot_touch_tenants_with_own_credentials(): void
    {
        config([
            'asaas.webhook_token' => 'global-token-0123456789abcdef0123456789',
            'asaas.webhook_allow_global_token' => true,
            'asaas.api_key' => '$aact_global_key_1234567890',
        ]);
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas('$aact_global_key_1234567890', 'pay_a1', $invoice, 'RECEIVED');

        $this->webhook('global-token-0123456789abcdef0123456789', 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)
            ->assertOk();

        $this->assertSame('pending', $invoice->fresh()->status);
    }

    public function test_legacy_global_token_only_applies_verified_charges_of_tenants_without_credentials(): void
    {
        config([
            'asaas.webhook_token' => 'global-token-0123456789abcdef0123456789',
            'asaas.webhook_allow_global_token' => true,
            'asaas.api_key' => '$aact_global_key_1234567890',
        ]);
        $legacyTenant = Tenant::factory()->create();
        $invoice = $this->invoiceWithCharge($legacyTenant, 'pay_legacy', 90.00);

        // Payload diz RECEIVED, mas a conta global ainda não confirmou: nada muda.
        $this->asaasHas('$aact_global_key_1234567890', 'pay_legacy', $invoice, 'PENDING');
        $this->webhook('global-token-0123456789abcdef0123456789', 'PAYMENT_RECEIVED', 'pay_legacy', $invoice->id, 'evt_1')->assertOk();
        $this->assertSame('pending', $invoice->fresh()->status);

        $this->asaasHas('$aact_global_key_1234567890', 'pay_legacy', $invoice, 'RECEIVED');
        $this->webhook('global-token-0123456789abcdef0123456789', 'PAYMENT_RECEIVED', 'pay_legacy', $invoice->id, 'evt_2')->assertOk();
        $this->assertSame('paid', $invoice->fresh()->status);
    }

    // ── Isolamento entre tenants ─────────────────────────────────────────

    public function test_tenant_a_cannot_pay_tenant_b_invoice_by_charge_id(): void
    {
        $invoiceB = $this->invoiceWithCharge($this->tenantB, 'pay_b1', 300.00);
        $this->asaasHas(self::KEY_B, 'pay_b1', $invoiceB, 'RECEIVED');

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_b1', $invoiceB->id)
            ->assertOk()
            ->assertExactJson(['received' => true]);

        $this->assertSame('pending', $invoiceB->fresh()->status);
        $this->assertNull(PaymentWebhookEvent::query()->sole()->invoice_id);
    }

    public function test_tenant_a_cannot_pay_tenant_b_invoice_by_external_reference(): void
    {
        $invoiceB = $this->invoiceWithoutCharge($this->tenantB, 300.00);
        // Atacante cria na própria conta uma cobrança apontando para a fatura de B.
        $this->asaasHas(self::KEY_A, 'pay_forjado', $invoiceB, 'RECEIVED');

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_forjado', $invoiceB->id)->assertOk();

        $invoiceB->refresh();
        $this->assertSame('pending', $invoiceB->status);
        $this->assertNull($invoiceB->cora_charge_id);
    }

    public function test_tenant_a_cannot_cancel_tenant_b_invoice(): void
    {
        $invoiceB = $this->invoiceWithCharge($this->tenantB, 'pay_b1', 300.00);
        $this->asaasHas(self::KEY_B, 'pay_b1', $invoiceB, 'DELETED');

        foreach (['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_OVERDUE'] as $i => $event) {
            $this->webhook(self::TOKEN_A, $event, 'pay_b1', $invoiceB->id, 'evt_' . $i)->assertOk();
        }

        $this->assertSame('pending', $invoiceB->fresh()->status);
    }

    public function test_response_does_not_reveal_whether_invoice_exists(): void
    {
        $invoiceB = $this->invoiceWithCharge($this->tenantB, 'pay_b1', 300.00);

        $existing = $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_b1', $invoiceB->id, 'evt_x')->json();
        $missing = $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_nada', 999999, 'evt_y')->json();

        $this->assertSame(['received' => true], $existing);
        $this->assertSame($existing, $missing);
    }

    // ── Autenticidade do pagamento ───────────────────────────────────────

    public function test_payload_says_paid_but_asaas_does_not_confirm(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'PENDING');

        $this->webhook(self::TOKEN_A, 'PAYMENT_CONFIRMED', 'pay_a1', $invoice->id, 'evt_1', ['status' => 'CONFIRMED'])->assertOk();

        $invoice->refresh();
        $this->assertSame('pending', $invoice->status);
        $this->assertNull($invoice->paid_at);
    }

    public function test_payment_unknown_to_asaas_is_not_applied(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)->assertOk();

        $this->assertSame('pending', $invoice->fresh()->status);
        $this->assertSame(PaymentWebhookEvent::STATUS_FAILED, PaymentWebhookEvent::query()->sole()->status);
    }

    public function test_divergent_amount_is_not_marked_paid(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED', ['value' => 2.00]);

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)->assertOk();

        $this->assertSame('pending', $invoice->fresh()->status);
        $this->assertSame(PaymentWebhookEvent::STATUS_FAILED, PaymentWebhookEvent::query()->sole()->status);
    }

    public function test_paid_with_interest_uses_original_value(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED', ['value' => 206.40, 'originalValue' => 200.00]);

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)->assertOk();

        $this->assertSame('paid', $invoice->fresh()->status);
    }

    public function test_charge_not_linked_to_invoice_is_rejected(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $other = $this->invoiceWithoutCharge($this->tenantA, 200.00);
        // Cobrança real da conta A, mas referenciando outra fatura.
        $this->asaasHas(self::KEY_A, 'pay_a2', $other, 'RECEIVED');

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a2', $invoice->id)->assertOk();

        $this->assertSame('pending', $invoice->fresh()->status);
        $this->assertSame('pay_a1', $invoice->fresh()->cora_charge_id);
        $this->assertSame(PaymentWebhookEvent::STATUS_FAILED, PaymentWebhookEvent::query()->sole()->status);
    }

    public function test_asaas_timeout_does_not_confirm_and_allows_retry(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED');
        $this->asaasDown = true;

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)->assertStatus(503);
        $this->assertSame('pending', $invoice->fresh()->status);

        // Reenvio do Asaas, com a API de volta: aplica normalmente.
        $this->asaasDown = false;
        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id)->assertOk();
        $this->assertSame('paid', $invoice->fresh()->status);
    }

    // ── Idempotência e ordem ─────────────────────────────────────────────

    public function test_duplicate_event_does_not_duplicate_effects(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED', ['paymentDate' => '2026-10-01']);

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id, 'evt_1')->assertOk();
        $paidAt = $invoice->fresh()->paid_at;

        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED', ['paymentDate' => '2026-10-15']);
        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id, 'evt_1')->assertOk();
        $this->webhook(self::TOKEN_A, 'PAYMENT_CONFIRMED', 'pay_a1', $invoice->id, 'evt_2')->assertOk();

        $this->assertEquals($paidAt, $invoice->fresh()->paid_at);
        $this->assertSame(2, PaymentWebhookEvent::query()->count());
    }

    public function test_same_event_id_from_other_tenant_does_not_block_legitimate_event(): void
    {
        $invoiceA = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $invoiceB = $this->invoiceWithCharge($this->tenantB, 'pay_b1', 300.00);
        $this->asaasHas(self::KEY_B, 'pay_b1', $invoiceB, 'RECEIVED');

        // Tenant A "ocupa" o ID de evento que o Asaas vai usar para B.
        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoiceA->id, 'evt_compartilhado')->assertOk();
        $this->webhook(self::TOKEN_B, 'PAYMENT_RECEIVED', 'pay_b1', $invoiceB->id, 'evt_compartilhado')->assertOk();

        $this->assertSame('paid', $invoiceB->fresh()->status);
    }

    public function test_pending_event_left_by_concurrent_delivery_is_applied_once(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED');

        // Entrega anterior registrou o evento e não terminou (simula corrida/queda do worker).
        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id, 'evt_1');
        PaymentWebhookEvent::query()->update(['status' => PaymentWebhookEvent::STATUS_PENDING]);
        $invoice->update(['status' => 'pending', 'paid_at' => null]);

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id, 'evt_1')->assertOk();
        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id, 'evt_1')->assertOk();

        $this->assertSame('paid', $invoice->fresh()->status);
        $this->assertSame(1, PaymentWebhookEvent::query()->count());
        $this->assertSame(PaymentWebhookEvent::STATUS_PROCESSED, PaymentWebhookEvent::query()->sole()->status);
    }

    public function test_out_of_order_overdue_after_payment_keeps_invoice_paid(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);
        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'RECEIVED');

        $this->webhook(self::TOKEN_A, 'PAYMENT_RECEIVED', 'pay_a1', $invoice->id, 'evt_2')->assertOk();
        $this->webhook(self::TOKEN_A, 'PAYMENT_OVERDUE', 'pay_a1', $invoice->id, 'evt_1')->assertOk();
        $this->webhook(self::TOKEN_A, 'PAYMENT_DELETED', 'pay_a1', $invoice->id, 'evt_0')->assertOk();

        $this->assertSame('paid', $invoice->fresh()->status);
    }

    public function test_overdue_and_deleted_follow_real_asaas_status(): void
    {
        $invoice = $this->invoiceWithCharge($this->tenantA, 'pay_a1', 200.00);

        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'OVERDUE');
        $this->webhook(self::TOKEN_A, 'PAYMENT_OVERDUE', 'pay_a1', $invoice->id, 'evt_1')->assertOk();
        $this->assertSame('overdue', $invoice->fresh()->status);

        $this->asaasHas(self::KEY_A, 'pay_a1', $invoice, 'OVERDUE', ['deleted' => true]);
        $this->webhook(self::TOKEN_A, 'PAYMENT_DELETED', 'pay_a1', $invoice->id, 'evt_2')->assertOk();
        $this->assertSame('cancelled', $invoice->fresh()->status);
    }

    public function test_created_event_links_charge_found_by_external_reference(): void
    {
        $invoice = $this->invoiceWithoutCharge($this->tenantA, 200.00);
        $this->asaasHas(self::KEY_A, 'pay_new', $invoice, 'PENDING');

        $this->webhook(self::TOKEN_A, 'PAYMENT_CREATED', 'pay_new', $invoice->id)->assertOk();

        $invoice->refresh();
        $this->assertSame('pay_new', $invoice->cora_charge_id);
        $this->assertSame('PENDING', $invoice->cora_status);
        $this->assertSame('pending', $invoice->status);
    }

    // ── Credenciais ──────────────────────────────────────────────────────

    public function test_webhook_token_cannot_be_reused_by_another_tenant(): void
    {
        $credentials = app(AsaasCredentialService::class);

        $this->assertTrue($credentials->webhookTokenInUseElsewhere(self::TOKEN_A, $this->tenantB, 'stage'));
        $this->assertFalse($credentials->webhookTokenInUseElsewhere(self::TOKEN_A, $this->tenantA, 'stage'));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /**
     * @param  array<string, mixed>  $paymentExtra
     */
    private function webhook(?string $token, string $event, string $paymentId, int $externalReference, ?string $eventId = null, array $paymentExtra = []): TestResponse
    {
        $headers = $token !== null ? ['asaas-access-token' => $token] : [];

        return $this->postJson('/api/webhooks/asaas', [
            'id' => $eventId ?? 'evt_' . $event . '_' . $paymentId,
            'event' => $event,
            'dateCreated' => '2026-10-20 10:00:00',
            'payment' => array_merge([
                'id' => $paymentId,
                'status' => 'RECEIVED',
                'value' => 0.01,
                'externalReference' => (string) $externalReference,
            ], $paymentExtra),
        ], $headers);
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function asaasHas(string $apiKey, string $paymentId, Invoice $invoice, string $status, array $extra = []): void
    {
        $this->asaasAccounts[$apiKey][$paymentId] = array_merge([
            'object' => 'payment',
            'id' => $paymentId,
            'status' => $status,
            'value' => (float) $invoice->amount,
            'externalReference' => (string) $invoice->id,
            'paymentDate' => in_array($status, ['RECEIVED', 'CONFIRMED'], true) ? '2026-10-20' : null,
            'deleted' => false,
        ], $extra);
    }

    private function invoiceWithCharge(Tenant $tenant, string $chargeId, float $amount): Invoice
    {
        return $this->invoiceWithoutCharge($tenant, $amount, [
            'cora_charge_id' => $chargeId,
            'cora_status' => 'PENDING',
            'cora_payload' => ['integration' => ['provider' => 'asaas', 'environment' => 'stage']],
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function invoiceWithoutCharge(Tenant $tenant, float $amount, array $attributes = []): Invoice
    {
        return Invoice::factory()->create(array_merge([
            'tenant_id' => $tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $tenant->id])->id,
            'amount' => $amount,
            'status' => 'pending',
        ], $attributes));
    }
}
