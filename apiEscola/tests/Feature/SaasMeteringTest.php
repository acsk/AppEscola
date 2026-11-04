<?php

namespace Tests\Feature;

use App\Exceptions\AiException;
use App\Models\AiUsageLog;
use App\Models\SaasPlan;
use App\Models\Tenant;
use App\Models\TenantAiCredential;
use App\Models\TenantStorageUsage;
use App\Models\User;
use App\Services\Ai\AiChatClient;
use App\Services\Ai\AiCredentialResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Services\Saas\TenantQuotaService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class SaasMeteringTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    private function tenantWithAi(): Tenant
    {
        $tenant = Tenant::factory()->create();
        TenantAiCredential::query()->create(['tenant_id' => $tenant->id, 'provider' => 'openrouter', 'api_key' => 'sk-or-tenant-000000000000', 'key_hint' => '…0000', 'active' => true, 'model' => 'openai/gpt-4o-mini']);

        return $tenant;
    }

    private function subscribe(Tenant $tenant, array $limits): void
    {
        $plan = SaasPlan::query()->create(['name' => 'P '.uniqid(), 'slug' => uniqid('p'), 'price_monthly' => 100, 'trial_days' => 0, 'status' => 'active', 'features' => ['academic', 'ai'], 'limits' => $limits]);
        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->postJson("/api/saas/tenants/{$tenant->id}/subscription", ['saas_plan_id' => $plan->id, 'billing_cycle' => 'monthly'])->assertCreated();
    }

    private function callAi(Tenant $tenant, User $user): array
    {
        $credential = app(AiCredentialResolver::class)->resolve($user, $tenant->id);

        return app(AiChatClient::class)->json($credential, 'sistema', 'usuário');
    }

    public function test_each_ai_call_is_metered_per_tenant_with_real_cost(): void
    {
        $tenant = $this->tenantWithAi();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id]);
        Http::fake(['*/chat/completions' => Http::response([
            'model' => 'openai/gpt-4o-mini',
            'choices' => [['message' => ['content' => '{"ok":true}'], 'finish_reason' => 'stop']],
            'usage' => ['prompt_tokens' => 1000, 'completion_tokens' => 500, 'cost' => 0.0123],
        ])]);

        $this->assertSame(['ok' => true], $this->callAi($tenant, $admin));
        Http::assertSent(fn ($request) => ($request['usage']['include'] ?? false) === true);

        $log = AiUsageLog::query()->sole();
        $this->assertSame($tenant->id, $log->tenant_id);
        $this->assertSame($admin->id, $log->user_id);
        $this->assertSame('success', $log->status);
        $this->assertSame(1000, $log->prompt_tokens);
        $this->assertEquals(0.0123, (float) $log->provider_cost_usd);
        $this->assertEquals(0.00045, (float) $log->estimated_cost_usd); // 1000×0,15 + 500×0,60 por milhão

        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->getJson('/api/saas/ai-usage')->assertOk()
            ->assertJsonPath('body.totals.requests', 1)
            ->assertJsonPath('body.by_tenant.0.tenant.id', $tenant->id);
    }

    public function test_provider_failure_is_recorded_as_error(): void
    {
        $tenant = $this->tenantWithAi();
        Http::fake(['*/chat/completions' => Http::response(['error' => 'x'], 500)]);

        try {
            $this->callAi($tenant, User::factory()->admin()->create(['tenant_id' => $tenant->id]));
            $this->fail('Esperava AiException');
        } catch (AiException) {
        }
        $this->assertSame('error', AiUsageLog::query()->sole()->status);
    }

    public function test_monthly_ai_limit_blocks_before_calling_the_provider(): void
    {
        $tenant = $this->tenantWithAi();
        $this->subscribe($tenant, ['ai_requests' => 1]);
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id]);
        Http::fake(['*/chat/completions' => Http::response(['choices' => [['message' => ['content' => '{}'], 'finish_reason' => 'stop']], 'usage' => []])]);

        $this->callAi($tenant, $admin);
        try {
            $this->callAi($tenant, $admin);
            $this->fail('Esperava limite de IA');
        } catch (AiException $e) {
            $this->assertSame('quota_exceeded', $e->errorCode);
        }
        Http::assertSentCount(1);
    }

    public function test_storage_is_measured_and_limits_uploads(): void
    {
        Storage::fake('public');
        Storage::fake('local');
        $tenant = Tenant::factory()->create();
        Storage::disk('public')->put("uploads/students/{$tenant->id}/1/a.jpg", str_repeat('x', 1_500_000));
        Storage::disk('public')->put("uploads/question-bank/{$tenant->id}/draft/b.png", str_repeat('y', 600_000));
        Storage::disk('local')->put("expenses/{$tenant->id}/9/c.pdf", str_repeat('z', 100_000));
        Storage::disk('public')->put('uploads/students/999999/other.jpg', str_repeat('o', 50_000)); // outro tenant

        $this->artisan('saas:measure-storage')->assertSuccessful();
        $usage = TenantStorageUsage::query()->where('tenant_id', $tenant->id)->sole();
        $this->assertSame(2_200_000, $usage->bytes);
        $this->assertSame(3, $usage->files);
        $this->assertSame(1_500_000, $usage->by_category['students']['bytes']);

        // 2,2 MB medidos (arredonda para 3 MB) com limite de 4 MB: arquivo de 2 MB passaria do limite; 1 KB ainda não.
        $this->subscribe($tenant, ['storage_mb' => 4]);
        $quotas = app(TenantQuotaService::class);
        $quotas->assertCanStore($tenant->id, UploadedFile::fake()->create('ok.pdf', 1));
        try {
            $quotas->assertCanStore($tenant->id, UploadedFile::fake()->create('grande.pdf', 2048));
            $this->fail('Esperava limite de armazenamento');
        } catch (HttpResponseException $e) {
            $this->assertSame(422, $e->getResponse()->getStatusCode());
            $this->assertSame('quota_exceeded', $e->getResponse()->getData(true)['body']['code']);
        }
    }
}
