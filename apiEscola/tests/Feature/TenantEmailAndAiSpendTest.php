<?php

namespace Tests\Feature;

use App\Models\AiUsageLog;
use App\Models\EmailLog;
use App\Models\Tenant;
use App\Models\TenantAiCredential;
use App\Models\TenantEmailSetting;
use App\Models\User;
use App\Services\Ai\AiCredentialResolver;
use App\Services\Email\EmailMessage;
use App\Services\Email\TenantEmailService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class TenantEmailAndAiSpendTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    private function configure(Tenant $tenant): void
    {
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $tenant->id]));
        $this->putJson('/api/email-settings', [
            'provider' => 'resend', 'api_key' => 're_test_1234567890abcd', 'from_email' => 'Contato@Escola.com.br', 'from_name' => 'Escola Alfa', 'reply_to' => 'secretaria@escola.com.br',
        ])->assertOk();
    }

    public function test_admin_configures_resend_without_exposing_the_key(): void
    {
        $tenant = Tenant::factory()->create();
        $this->configure($tenant);

        $response = $this->getJson('/api/email-settings')->assertOk()
            ->assertJsonPath('body.configured', true)
            ->assertJsonPath('body.key_hint', 'abcd')
            ->assertJsonPath('body.from_email', 'contato@escola.com.br');
        $this->assertStringNotContainsString('re_test_1234567890abcd', $response->getContent());
        $this->assertNotSame('re_test_1234567890abcd', DB::table('tenant_email_settings')->value('api_key')); // criptografada
        $this->assertSame('re_test_1234567890abcd', TenantEmailSetting::query()->value('api_key'));
    }

    public function test_only_admin_or_super_admin_and_never_another_tenant(): void
    {
        $a = Tenant::factory()->create();
        $b = Tenant::factory()->create();
        $this->configure($b);

        Sanctum::actingAs(User::factory()->create(['tenant_id' => $a->id, 'role' => 'professor', 'status' => 'active']));
        $this->getJson('/api/email-settings')->assertForbidden();

        // Admin do tenant A pedindo o B: continua vendo só o próprio (sem configuração).
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $a->id]));
        $this->getJson("/api/email-settings?tenant_id={$b->id}")->assertOk()->assertJsonPath('body.configured', false);

        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->getJson("/api/email-settings?tenant_id={$b->id}")->assertOk()->assertJsonPath('body.configured', true);
    }

    public function test_verify_domain_with_resend(): void
    {
        $tenant = Tenant::factory()->create();
        $this->configure($tenant);

        Http::fake(['api.resend.com/domains' => Http::sequence()
            ->push(['data' => [['name' => 'escola.com.br', 'status' => 'verified']]])
            ->push(['data' => [['name' => 'escola.com.br', 'status' => 'pending']]])
            ->push(['name' => 'restricted_api_key', 'message' => 'x'], 401)
            ->push(['name' => 'validation_error', 'message' => 'API key is invalid'], 403)]);

        $this->postJson('/api/email-settings/verify')->assertOk()->assertJsonPath('body.domain_status', 'verified');
        $this->postJson('/api/email-settings/verify')->assertUnprocessable()->assertJsonPath('body.domain_status', 'pending');
        $this->postJson('/api/email-settings/verify')->assertOk()->assertJsonPath('body.domain_status', 'unknown'); // chave só de envio
        $this->postJson('/api/email-settings/verify')->assertUnprocessable()->assertJsonPath('body.key_valid', false);
    }

    public function test_send_logs_success_and_failure(): void
    {
        $tenant = Tenant::factory()->create();
        $this->configure($tenant);

        Http::fake(['api.resend.com/emails' => Http::sequence()
            ->push(['id' => 'msg_123'])
            ->push(['name' => 'validation_error', 'message' => 'Invalid `to` field.'], 422)]);
        $this->postJson('/api/email-settings/test', ['to' => 'diretor@escola.com.br'])->assertOk();
        Http::assertSent(fn (HttpRequest $r) => $r->url() === 'https://api.resend.com/emails'
            && $r['from'] === 'Escola Alfa <contato@escola.com.br>'
            && $r['to'] === ['diretor@escola.com.br']
            && $r['reply_to'] === 'secretaria@escola.com.br'
            && $r['tags'] === [['name' => 'category', 'value' => 'test']]
            && $r->hasHeader('Authorization', 'Bearer re_test_1234567890abcd'));
        $this->assertSame('msg_123', EmailLog::query()->sole()->provider_message_id);

        $result = app(TenantEmailService::class)->send($tenant->id, new EmailMessage(['x@escola.com.br'], 'Aviso', 'Oi'), 'notification');
        $this->assertFalse($result->sent);
        $this->assertSame('validation_error', $result->errorCode);
        $this->assertSame(2, EmailLog::query()->count());
        $this->getJson('/api/email-settings/logs')->assertOk()->assertJsonPath('body.items.0.status', 'failed')->assertJsonPath('body.meta.total', 2);
    }

    public function test_spend_is_summed_per_tenant_and_key_source(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id]);
        TenantAiCredential::query()->create(['tenant_id' => $tenant->id, 'provider' => 'openrouter', 'api_key' => 'sk-or-tenant-0000000000', 'key_hint' => '0000', 'active' => true]);
        $this->assertSame('tenant', app(AiCredentialResolver::class)->resolve($admin, $tenant->id)['source']);

        foreach ([['tenant', 0.5, null], ['tenant', null, 0.2], ['env', 0.1, null]] as [$source, $real, $estimated]) {
            AiUsageLog::query()->create(['tenant_id' => $tenant->id, 'feature' => 'question-bank/ai/classify', 'provider' => 'openrouter', 'endpoint' => 'chat/completions', 'credential_source' => $source, 'prompt_tokens' => 100, 'completion_tokens' => 50, 'provider_cost_usd' => $real, 'estimated_cost_usd' => $estimated, 'status' => 'success']);
        }

        Sanctum::actingAs($admin);
        $this->getJson('/api/ai-settings/usage')->assertOk()
            ->assertJsonPath('body.month.requests', 3)
            ->assertJsonPath('body.month.cost_usd', 0.8)
            ->assertJsonPath('body.month.tenant_key_cost_usd', 0.7)
            ->assertJsonPath('body.month.platform_key_cost_usd', 0.1)
            ->assertJsonPath('body.by_provider.0.provider', 'openrouter')
            ->assertJsonPath('body.total.tokens', 450);
    }
}
