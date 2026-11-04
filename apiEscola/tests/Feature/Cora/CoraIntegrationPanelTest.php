<?php

namespace Tests\Feature\Cora;

use App\Models\CoraWebhookEndpoint;
use App\Models\CoraWebhookEvent;
use App\Models\Invoice;
use App\Models\InvoiceAuditLog;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\TenantCoraCredential;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CoraIntegrationPanelTest extends TestCase
{
    use RefreshDatabase;

    private const CORA_INVOICE_URL = 'https://api.stage.cora.com.br/v2/invoices/*';

    private Tenant $tenant;

    private User $admin;

    private CoraWebhookEndpoint $endpoint;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        config(['services.cora.token' => 'token-de-teste', 'services.cora.api_base_url_stage' => 'https://api.stage.cora.com.br']);

        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']);
        $this->endpoint = CoraWebhookEndpoint::create([
            'tenant_id' => $this->tenant->id,
            'environment' => 'stage',
            'callback_key_hash' => CoraWebhookEndpoint::hashKey('chave-secreta-do-teste-0123456789abcdef0123'),
            'cora_endpoint_id' => 'end_secreto',
            'trigger' => '*',
            'active' => true,
            'registered_at' => now(),
        ]);
    }

    private function coraInvoice(Tenant $tenant, string $chargeId, array $attrs = []): Invoice
    {
        return Invoice::factory()->create(array_merge([
            'tenant_id' => $tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $tenant->id])->id,
            'amount' => 175,
            'status' => 'pending',
            'due_date' => '2026-10-20',
            'payment_method' => 'pix',
            'cora_charge_id' => $chargeId,
            'cora_payload' => ['integration' => ['provider' => 'cora', 'environment' => 'stage']],
        ], $attrs));
    }

    private function event(array $attrs): CoraWebhookEvent
    {
        return CoraWebhookEvent::create(array_merge([
            'endpoint_id' => $this->endpoint->id,
            'tenant_id' => $this->endpoint->tenant_id,
            'environment' => 'stage',
            'event_id' => 'evt_' . uniqid(),
            'event_type' => 'invoice.paid',
            'resource_id' => 'inv_x',
            'status' => 'pending',
            'available_at' => now(),
            'received_at' => now(),
        ], $attrs));
    }

    public function test_overview_shows_status_without_secrets(): void
    {
        TenantCoraCredential::create([
            'tenant_id' => $this->tenant->id,
            'client_id' => 'client-secreto',
            'certificate_path' => 'cora/cert.pem',
            'private_key_path' => 'cora/key.pem',
            'environment' => 'stage',
            'active' => true,
            'configured_at' => now(),
        ]);
        $this->event(['status' => 'failed']);
        $this->event(['status' => 'needs_review', 'duplicates' => 2]);
        $this->event(['status' => 'processed', 'result' => 'paid', 'processed_at' => now()]);

        $response = $this->actingAs($this->admin)->getJson('/api/finance/cora/overview')->assertOk();

        $response->assertJsonPath('body.environments.stage.credentials.configured', true)
            ->assertJsonPath('body.environments.stage.webhook.registered', true)
            ->assertJsonPath('body.environments.prod.webhook.registered', false)
            ->assertJsonPath('body.counts.failed', 1)
            ->assertJsonPath('body.counts.review', 1)
            ->assertJsonPath('body.counts.processed', 1)
            ->assertJsonPath('body.counts.duplicates', 2);

        $raw = $response->getContent();
        foreach (['client-secreto', 'cert.pem', 'key.pem', 'end_secreto', $this->endpoint->callback_key_hash] as $secret) {
            $this->assertStringNotContainsString($secret, $raw);
        }
    }

    public function test_events_are_filtered_by_stage_and_isolated_by_tenant(): void
    {
        $invoice = $this->coraInvoice($this->tenant, 'inv_pago', ['status' => 'paid', 'paid_at' => now()]);
        $this->event(['status' => 'processed', 'result' => 'paid', 'invoice_id' => $invoice->id, 'resource_id' => 'inv_pago']);
        $this->event(['status' => 'processed', 'result' => 'unchanged']);
        $this->event(['status' => 'pending']);

        $other = Tenant::factory()->create();
        $otherEndpoint = CoraWebhookEndpoint::create([
            'tenant_id' => $other->id,
            'environment' => 'stage',
            'callback_key_hash' => CoraWebhookEndpoint::hashKey('outra-chave-0123456789abcdef0123456789'),
            'active' => true,
        ]);
        CoraWebhookEvent::create([
            'endpoint_id' => $otherEndpoint->id, 'tenant_id' => $other->id, 'environment' => 'stage',
            'event_id' => 'evt_alheio', 'event_type' => 'invoice.paid', 'resource_id' => 'inv_alheio',
            'status' => 'processed', 'result' => 'paid',
        ]);

        $all = $this->actingAs($this->admin)->getJson('/api/finance/cora/events')->assertOk();
        $this->assertSame(3, $all->json('body.meta.total'));
        $this->assertNotContains('evt_alheio', array_column($all->json('body.items'), 'event_id'));

        $confirmed = $this->actingAs($this->admin)->getJson('/api/finance/cora/events?stage=confirmed')->assertOk();
        $this->assertSame(['confirmed'], array_column($confirmed->json('body.items'), 'stage'));
        $this->assertSame($invoice->id, $confirmed->json('body.items.0.invoice.id'));

        $this->assertSame(['received'], array_column(
            $this->actingAs($this->admin)->getJson('/api/finance/cora/events?stage=received')->json('body.items'), 'stage'));
        $this->assertSame(['waiting'], array_column(
            $this->actingAs($this->admin)->getJson('/api/finance/cora/events?stage=waiting')->json('body.items'), 'stage'));

        $this->assertSame(1, $this->actingAs($this->admin)
            ->getJson('/api/finance/cora/events?search=%23' . $invoice->id)->json('body.meta.total'));
    }

    public function test_roles_without_finance_permission_are_blocked(): void
    {
        $professor = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor', 'status' => 'active']);
        $event = $this->event(['status' => 'failed']);

        $this->actingAs($professor)->getJson('/api/finance/cora/overview')->assertForbidden();
        $this->actingAs($professor)->getJson('/api/finance/cora/events')->assertForbidden();
        $this->actingAs($professor)->postJson("/api/finance/cora/events/{$event->id}/retry")->assertForbidden();
        $this->assertSame('failed', $event->refresh()->status);
    }

    public function test_retry_reprocesses_with_cora_confirmation_and_records_who_asked(): void
    {
        $invoice = $this->coraInvoice($this->tenant, 'inv_falhou');
        $event = $this->event(['status' => 'failed', 'attempts' => 5, 'resource_id' => 'inv_falhou', 'last_error' => 'timeout']);
        Http::fake([self::CORA_INVOICE_URL => Http::response(['id' => 'inv_falhou', 'status' => 'PAID', 'paid_at' => '2026-11-03T09:00:00-03:00'])]);

        $this->actingAs($this->admin)->postJson("/api/finance/cora/events/{$event->id}/retry")
            ->assertOk()
            ->assertJsonPath('body.stage', 'confirmed')
            ->assertJsonPath('body.manual_retries', 1)
            ->assertJsonPath('body.last_retried_by.id', $this->admin->id);

        $this->assertSame('paid', $invoice->refresh()->status);
        $this->assertSame('webhook', InvoiceAuditLog::where('invoice_id', $invoice->id)->where('action', 'paid')->sole()->source);

        // Já processado: não pode reprocessar de novo.
        $this->actingAs($this->admin)->postJson("/api/finance/cora/events/{$event->id}/retry")->assertStatus(422);
    }

    public function test_retry_of_another_tenant_event_is_not_found(): void
    {
        $other = Tenant::factory()->create();
        $otherAdmin = User::factory()->admin()->create(['tenant_id' => $other->id, 'status' => 'active']);
        $event = $this->event(['status' => 'failed']);

        $this->actingAs($otherAdmin)->postJson("/api/finance/cora/events/{$event->id}/retry")->assertNotFound();
        $this->assertSame('failed', $event->refresh()->status);
    }

    public function test_consult_settles_only_when_cora_confirms(): void
    {
        $open = $this->coraInvoice($this->tenant, 'inv_aberta');
        Http::fake([self::CORA_INVOICE_URL => Http::sequence()
            ->push(['id' => 'inv_aberta', 'status' => 'OPEN'])
            ->push(['id' => 'inv_aberta', 'status' => 'PAID', 'paid_at' => '2026-11-03T09:00:00-03:00'])]);

        $this->actingAs($this->admin)->postJson("/api/finance/cora/invoices/{$open->id}/consult")
            ->assertOk()->assertJsonPath('body.outcome', 'unchanged');
        $this->assertSame('pending', $open->refresh()->status);

        $this->actingAs($this->admin)->postJson("/api/finance/cora/invoices/{$open->id}/consult")
            ->assertOk()->assertJsonPath('body.outcome', 'paid');
        $this->assertSame('paid', $open->refresh()->status);

        $log = InvoiceAuditLog::where('invoice_id', $open->id)->where('action', 'paid')->sole();
        $this->assertSame('user', $log->source);
        $this->assertSame($this->admin->id, $log->user_id);
    }

    public function test_consult_rejects_foreign_or_non_cora_invoices(): void
    {
        Http::fake();
        $other = Tenant::factory()->create();
        $foreign = $this->coraInvoice($other, 'inv_alheia');
        $local = $this->coraInvoice($this->tenant, '', ['cora_charge_id' => null]);

        $this->actingAs($this->admin)->postJson("/api/finance/cora/invoices/{$foreign->id}/consult")->assertNotFound();
        $this->actingAs($this->admin)->postJson("/api/finance/cora/invoices/{$local->id}/consult")->assertStatus(422);
        Http::assertNothingSent();
    }
}
