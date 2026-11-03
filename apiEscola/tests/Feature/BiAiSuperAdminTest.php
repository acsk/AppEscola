<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TenantAiCredential;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Super admin sem chave no .env, escola com chave própria: liga a IA nos Critérios e gera insights. */
class BiAiSuperAdminTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    public function test_super_admin_uses_tenant_key_through_criteria(): void
    {
        $this->seed(DomainSeeder::class);
        config()->set('services.ai.openrouter.api_key', '');
        config()->set('services.ai.openai.api_key', '');
        $tenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $q = '?tenant_id='.$tenant->id;

        $this->putJson('/api/ai-settings/openrouter'.$q, ['api_key' => 'sk-or-tenant-0000000000000000'])->assertOk();
        $this->assertTrue(TenantAiCredential::query()->where('tenant_id', $tenant->id)->exists());

        $this->getJson('/api/bi/criteria'.$q)->assertOk()->assertJsonPath('body.ai.available', true)->assertJsonPath('body.ai.reason', 'disabled');
        $this->putJson('/api/bi/criteria'.$q, ['ai_enabled' => true])->assertOk()->assertJsonPath('body.ai.enabled', true);
        $this->getJson('/api/bi/ai/status'.$q)->assertOk()->assertJsonPath('body.enabled', true);

        Http::fake(['*/chat/completions' => Http::response(['choices' => [['message' => ['content' => json_encode(['insights' => [['title' => 'T', 'text' => 'Texto.', 'area' => 'geral', 'evidence' => []]]])]]]], 200)]);
        $this->postJson('/api/bi/ai/drafts'.$q.'&kind=school_insights')->assertCreated()->assertJsonPath('body.content.insights.0.title', 'T');
    }
}
