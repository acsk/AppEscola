<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class TenantAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_gets_token_scoped_to_tenant(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        $superAdmin = User::factory()->superAdmin()->create(['status' => 'active']);
        $saToken = $superAdmin->createToken('api-token')->plainTextToken;

        $token = $this->withToken($saToken)
            ->postJson("/api/tenants/{$tenant->id}/access")
            ->assertOk()
            ->assertJsonPath('body.tenant.id', $tenant->id)
            ->json('body.token');

        $stored = PersonalAccessToken::findToken($token);
        $this->assertSame(["tenant:{$tenant->id}"], $stored->abilities);
        $this->assertNotNull($stored->expires_at);
        $this->assertTrue($stored->expires_at->isFuture());

        // O token da sessão do super admin continua válido e sem tenant.
        $this->assertSame(2, $superAdmin->tokens()->count());

        $this->app['auth']->forgetGuards();
        $this->withToken($token)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('selected_tenant_id', $tenant->id);
    }

    public function test_only_super_admin_can_access_tenant(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);

        foreach (['admin', 'coordenador', 'secretaria', 'aluno'] as $role) {
            $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => $role, 'status' => 'active']);

            $this->actingAs($user)->postJson("/api/tenants/{$tenant->id}/access")->assertForbidden();
        }

        $this->assertSame(0, PersonalAccessToken::where('name', 'support-access')->count());
    }

    public function test_inactive_tenant_cannot_be_accessed(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'inactive']);
        $superAdmin = User::factory()->superAdmin()->create(['status' => 'active']);

        $this->actingAs($superAdmin)->postJson("/api/tenants/{$tenant->id}/access")->assertUnprocessable();
    }
}
