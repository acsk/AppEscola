<?php

namespace Tests\Feature;

use App\Models\CoraWebhookEndpoint;
use App\Models\CoraWebhookEvent;
use App\Models\Invoice;
use App\Models\InvoiceAuditLog;
use App\Models\Student;
use App\Models\Tenant;
use App\Services\Cora\CoraWebhookProcessor;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CoraWebhookTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'chave-opaca-de-teste-0123456789abcdef0123456789';

    private const CORA_INVOICE_URL = 'https://api.stage.cora.com.br/v2/invoices/*';

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        config(['services.cora.token' => 'token-de-teste', 'services.cora.api_base_url_stage' => 'https://api.stage.cora.com.br']);

        $this->tenant = Tenant::factory()->create();
        CoraWebhookEndpoint::create([
            'tenant_id' => $this->tenant->id,
            'environment' => 'stage',
            'callback_key_hash' => CoraWebhookEndpoint::hashKey(self::KEY),
            'active' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
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

    private function notify(string $eventId, string $type, string $resourceId, string $key = self::KEY)
    {
        return $this->call('POST', "/api/webhooks/cora/{$key}", [], [], [], array_filter([
            'HTTP_WEBHOOK_EVENT_ID' => $eventId,
            'HTTP_WEBHOOK_EVENT_TYPE' => $type,
            'HTTP_WEBHOOK_RESOURCE_ID' => $resourceId,
            'CONTENT_LENGTH' => '0',
        ], fn ($v) => $v !== ''));
    }

    private function fakeCora(array $body, int $status = 200): void
    {
        Http::fake([self::CORA_INVOICE_URL => Http::response($body, $status)]);
    }

    public function test_empty_body_is_accepted_and_duplicates_are_one_event(): void
    {
        $this->fakeCora(['id' => 'inv_x', 'status' => 'OPEN']);

        $this->notify('evt_1', 'invoice.created', 'inv_x')->assertOk()->assertJson(['success' => true]);
        $this->notify('evt_1', 'invoice.created', 'inv_x')->assertOk();

        $event = CoraWebhookEvent::sole();
        $this->assertSame(1, $event->duplicates);
        $this->assertNull($event->anomaly);

        // Mesmo id com recurso diferente: mantém o original e anota a divergência.
        $this->notify('evt_1', 'invoice.paid', 'inv_outro')->assertOk();
        $event->refresh();
        $this->assertSame('inv_x', $event->resource_id);
        $this->assertStringContainsString('inv_outro', $event->anomaly);
    }

    public function test_invalid_headers_and_unknown_callback_are_rejected(): void
    {
        $this->notify('', 'invoice.paid', 'inv_x')->assertStatus(400);
        $this->notify('evt_1', 'paid', 'inv_x')->assertStatus(400);
        $this->notify('evt 1', 'invoice.paid', 'inv_x')->assertStatus(400);
        $this->notify('evt_1', 'invoice.paid', 'inv_x', 'chave-desconhecida-0123456789abcdef0123456789')->assertNotFound();

        CoraWebhookEndpoint::query()->update(['active' => false]);
        $this->notify('evt_1', 'invoice.paid', 'inv_x')->assertNotFound();

        $this->assertSame(0, CoraWebhookEvent::count());
    }

    public function test_paid_is_settled_once_after_confirming_on_cora(): void
    {
        $invoice = $this->coraInvoice($this->tenant, 'inv_pago');
        $this->fakeCora(['id' => 'inv_pago', 'status' => 'PAID', 'paid_at' => '2026-10-19T14:30:00-03:00']);

        $this->notify('evt_a', 'invoice.paid', 'inv_pago')->assertOk();
        // Outro aviso do mesmo pagamento (event_id diferente): não baixa de novo.
        $this->notify('evt_b', 'invoice.paid', 'inv_pago')->assertOk();

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertSame('2026-10-19 17:30:00', $invoice->paid_at->utc()->toDateTimeString());

        $events = CoraWebhookEvent::orderBy('id')->get();
        $this->assertSame(['processed', 'processed'], $events->pluck('status')->all());
        $this->assertSame(['paid', 'unchanged'], $events->pluck('result')->all());
        $this->assertSame($invoice->id, $events[0]->invoice_id);

        $paidLogs = InvoiceAuditLog::where('invoice_id', $invoice->id)->where('action', 'paid')->get();
        $this->assertCount(1, $paidLogs);
        $this->assertSame('webhook', $paidLogs[0]->source);
        Http::assertSent(fn ($request) => $request->url() === 'https://api.stage.cora.com.br/v2/invoices/inv_pago'
            && $request->hasHeader('Authorization', 'Bearer token-de-teste'));
    }

    public function test_paid_header_without_paid_status_on_cora_does_not_settle(): void
    {
        $invoice = $this->coraInvoice($this->tenant, 'inv_aberto');
        $this->fakeCora(['id' => 'inv_aberto', 'status' => 'OPEN']);

        $this->notify('evt_falso', 'invoice.paid', 'inv_aberto')->assertOk();

        $this->assertSame('pending', $invoice->refresh()->status);
        $this->assertSame('unchanged', CoraWebhookEvent::sole()->result);
    }

    public function test_late_overdue_or_canceled_does_not_reopen_paid_invoice(): void
    {
        $invoice = $this->coraInvoice($this->tenant, 'inv_quitado', ['status' => 'paid', 'paid_at' => '2026-10-19 10:00:00']);
        $this->fakeCora(['id' => 'inv_quitado', 'status' => 'CANCELLED']);

        $this->notify('evt_late', 'invoice.canceled', 'inv_quitado')->assertOk();

        $this->assertSame('paid', $invoice->refresh()->status);
    }

    public function test_invoice_of_another_tenant_is_never_touched(): void
    {
        $other = Tenant::factory()->create();
        $foreign = $this->coraInvoice($other, 'inv_alheio');
        $this->fakeCora(['id' => 'inv_alheio', 'status' => 'PAID']);

        $this->notify('evt_x', 'invoice.paid', 'inv_alheio')->assertOk();

        $this->assertSame('pending', $foreign->refresh()->status);
        $event = CoraWebhookEvent::sole();
        $this->assertSame('needs_review', $event->status);
        $this->assertSame('unknown_invoice', $event->result);
        Http::assertNothingSent();
    }

    public function test_cora_failure_keeps_event_and_retries_with_backoff(): void
    {
        Carbon::setTestNow('2026-11-03 10:00:00');
        $invoice = $this->coraInvoice($this->tenant, 'inv_instavel');
        // 1ª consulta: Cora fora do ar; 2ª: cobrança paga.
        Http::fake([self::CORA_INVOICE_URL => Http::sequence()
            ->push(['message' => 'indisponível'], 500)
            ->push(['id' => 'inv_instavel', 'status' => 'PAID', 'paid_at' => '2026-11-03T09:00:00-03:00'])]);

        $this->notify('evt_r', 'invoice.paid', 'inv_instavel')->assertOk();

        $event = CoraWebhookEvent::sole();
        $this->assertSame('pending', $event->status);
        $this->assertSame(1, $event->attempts);
        $this->assertSame('2026-11-03 10:01:00', $event->available_at->toDateTimeString());
        $this->assertNotNull($event->last_error);

        // Antes da hora: o agendador não pega.
        $processor = app(CoraWebhookProcessor::class);
        $this->assertSame(0, $processor->processDue());

        // Cora volta: na próxima rodada a baixa acontece.
        Carbon::setTestNow('2026-11-03 10:02:00');
        $this->assertSame(1, $processor->processDue());
        $this->assertSame('paid', $invoice->refresh()->status);
        $this->assertSame('processed', $event->refresh()->status);

        // Reprocessar um evento concluído não faz nada.
        $this->assertNull($processor->process($event->id));
    }

    public function test_event_fails_after_exhausting_attempts(): void
    {
        Carbon::setTestNow('2026-11-03 10:00:00');
        $this->coraInvoice($this->tenant, 'inv_quebrado');
        $this->fakeCora([], 500);
        $this->notify('evt_f', 'invoice.paid', 'inv_quebrado')->assertOk();

        $processor = app(CoraWebhookProcessor::class);
        foreach ([2, 10, 30, 120, 400] as $minutes) {
            Carbon::setTestNow(Carbon::parse('2026-11-03 10:00:00')->addMinutes($minutes));
            $processor->processDue();
        }

        $event = CoraWebhookEvent::sole();
        $this->assertSame('failed', $event->status);
        $this->assertSame(count(CoraWebhookProcessor::BACKOFF_MINUTES), $event->attempts);
    }

    public function test_register_command_sends_idempotency_key_and_stores_only_the_key_hash(): void
    {
        $other = Tenant::factory()->create();
        Http::fake(['https://api.stage.cora.com.br/endpoints/' => Http::response(['id' => 'end_123', 'active' => true], 201)]);

        $this->artisan('cora:webhook-register', [
            'tenant' => $other->id,
            '--trigger' => 'paid',
            '--base-url' => 'https://api.exemplo.com.br',
            '--idempotency-key' => '11111111-2222-3333-4444-555555555555',
        ])->assertSuccessful();

        $endpoint = CoraWebhookEndpoint::where('tenant_id', $other->id)->sole();
        $this->assertSame('end_123', $endpoint->cora_endpoint_id);
        $this->assertSame('paid', $endpoint->trigger);

        Http::assertSent(function ($request) use ($endpoint) {
            $key = substr($request['url'], strlen('https://api.exemplo.com.br/api/webhooks/cora/'));

            return $request->hasHeader('Idempotency-Key', '11111111-2222-3333-4444-555555555555')
                && $request['resource'] === 'invoice'
                && $request['trigger'] === 'paid'
                && strlen($key) === 48
                && CoraWebhookEndpoint::hashKey($key) === $endpoint->callback_key_hash;
        });
    }
}
