<?php

namespace Tests\Feature;

use App\Models\SupportAccess;
use App\Models\SupportAccessReason;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class TenantAccessTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function reasonId(bool $requiresDetails = false): int
    {
        return SupportAccessReason::query()->where('requires_details', $requiresDetails)->value('id');
    }

    /** @return array{0: User, 1: string} */
    private function superAdminSession(): array
    {
        $superAdmin = User::factory()->superAdmin()->create(['status' => 'active']);

        return [$superAdmin, $superAdmin->createToken('api-token')->plainTextToken];
    }

    private function start(string $saToken, Tenant $tenant, array $payload = [])
    {
        $response = $this->withToken($saToken)->postJson("/api/tenants/{$tenant->id}/access", $payload + [
            'reason_id' => $this->reasonId(),
            'details' => 'Conferir cobranças de outubro',
            'duration_minutes' => 60,
        ]);
        $this->app['auth']->forgetGuards();

        return $response;
    }

    public function test_super_admin_starts_access_with_reason_and_duration(): void
    {
        Carbon::setTestNow('2026-11-03 10:00:00');
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [$superAdmin, $saToken] = $this->superAdminSession();

        $response = $this->start($saToken, $tenant)
            ->assertOk()
            ->assertJsonPath('body.tenant.id', $tenant->id)
            ->assertJsonPath('body.access.duration_minutes', 60);

        $access = SupportAccess::sole();
        $this->assertSame($superAdmin->id, $access->user_id);
        $this->assertSame('Conferir cobranças de outubro', $access->details);
        $this->assertSame('2026-11-03 11:00:00', $access->expires_at->toDateTimeString());

        $stored = PersonalAccessToken::findToken($response->json('body.token'));
        $this->assertSame(["tenant:{$tenant->id}", "support-access:{$access->id}"], $stored->abilities);
        $this->assertSame('2026-11-03 11:00:00', $stored->expires_at->toDateTimeString());

        $this->withToken($response->json('body.token'))
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('selected_tenant_id', $tenant->id);
    }

    public function test_reason_and_duration_are_required(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [, $saToken] = $this->superAdminSession();

        $this->start($saToken, $tenant, ['reason_id' => null])->assertUnprocessable()->assertJsonValidationErrors('reason_id');
        $this->start($saToken, $tenant, ['duration_minutes' => 600])->assertUnprocessable()->assertJsonValidationErrors('duration_minutes');
        // "Outro" exige o detalhe do que será feito.
        $this->start($saToken, $tenant, ['reason_id' => $this->reasonId(true), 'details' => 'curto'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('details');

        $this->assertSame(0, SupportAccess::count());
    }

    public function test_mutations_are_recorded_and_reads_are_not(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [, $saToken] = $this->superAdminSession();
        $token = $this->start($saToken, $tenant)->json('body.token');

        $this->withToken($token)->getJson('/api/invoices')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->postJson('/api/invoices', [])->assertUnprocessable();

        $actions = SupportAccess::sole()->actions()->get();
        $this->assertCount(1, $actions);
        $this->assertSame('POST', $actions[0]->method);
        $this->assertSame('/api/invoices', $actions[0]->path);
        $this->assertSame(422, $actions[0]->status);
    }

    public function test_ending_access_revokes_token_and_keeps_super_admin_session(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [, $saToken] = $this->superAdminSession();
        $token = $this->start($saToken, $tenant)->json('body.token');

        $this->withToken($token)->postJson('/api/support-access/end')->assertOk();
        $this->app['auth']->forgetGuards();

        $this->assertNotNull(SupportAccess::sole()->ended_at);
        // Encerrar a sessão não conta como alteração de dados.
        $this->assertSame(0, SupportAccess::sole()->actions()->count());
        $this->assertNull(PersonalAccessToken::findToken($token));
        $this->withToken($saToken)->getJson('/api/me')->assertOk()->assertJsonPath('selected_tenant_id', null);
    }

    public function test_expired_or_replaced_access_is_cut_on_next_request(): void
    {
        Carbon::setTestNow('2026-11-03 10:00:00');
        $tenantA = Tenant::factory()->create(['status' => 'active']);
        $tenantB = Tenant::factory()->create(['status' => 'active']);
        [, $saToken] = $this->superAdminSession();

        $first = $this->start($saToken, $tenantA)->json('body.token');
        // Entrar em outro tenant encerra o acesso anterior e revoga o token dele.
        $second = $this->start($saToken, $tenantB)->json('body.token');
        $this->assertNull(PersonalAccessToken::findToken($first));
        $this->assertSame(1, SupportAccess::whereNull('ended_at')->count());

        // Encerrado no banco (ex.: por outro processo): a próxima requisição já recebe 401.
        SupportAccess::whereNull('ended_at')->update(['ended_at' => now()]);
        $this->withToken($second)->getJson('/api/invoices')->assertUnauthorized();
    }

    public function test_only_super_admin_can_access_tenant(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);

        foreach (['admin', 'coordenador', 'secretaria', 'aluno'] as $role) {
            $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => $role, 'status' => 'active']);

            $this->actingAs($user)->postJson("/api/tenants/{$tenant->id}/access", [
                'reason_id' => $this->reasonId(),
                'duration_minutes' => 60,
            ])->assertForbidden();
            $this->actingAs($user)->getJson('/api/support-access/history')->assertForbidden();
        }

        $this->assertSame(0, SupportAccess::count());
    }

    public function test_inactive_tenant_cannot_be_accessed(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'inactive']);
        [, $saToken] = $this->superAdminSession();

        $this->start($saToken, $tenant)->assertUnprocessable();
    }

    public function test_history_lists_accesses_with_action_count(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [, $saToken] = $this->superAdminSession();
        $this->start($saToken, $tenant);

        $this->withToken($saToken)
            ->getJson("/api/support-access/history?tenant={$tenant->id}")
            ->assertOk()
            ->assertJsonPath('body.items.0.tenant.id', $tenant->id)
            ->assertJsonPath('body.items.0.details', 'Conferir cobranças de outubro')
            ->assertJsonPath('body.items.0.active', true)
            ->assertJsonPath('body.items.0.actions_count', 0);
    }
}
