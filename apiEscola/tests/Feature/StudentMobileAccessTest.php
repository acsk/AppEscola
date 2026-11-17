<?php

namespace Tests\Feature;

use App\Models\Student;
use App\Models\SupportAccess;
use App\Models\SupportAccessReason;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class StudentMobileAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        config(['mobile.web_url' => 'http://localhost:8081']);
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

    /** @return array{student: Student, user: User} */
    private function studentWithApp(Tenant $tenant, array $userAttributes = []): array
    {
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'aluno',
            'status' => 'active',
            'password_change_required' => true,
        ] + $userAttributes);
        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'name' => 'Maria da Silva',
            'enrollment_number' => '202600099',
        ]);

        return ['student' => $student, 'user' => $user];
    }

    private function start(string $saToken, Student $student, array $payload = [])
    {
        $response = $this->withToken($saToken)->postJson("/api/students/{$student->id}/mobile-access", $payload + [
            'reason_id' => $this->reasonId(),
            'details' => 'Ver o financeiro que o aluno relatou',
            'duration_minutes' => 60,
        ]);
        $this->app['auth']->forgetGuards();

        return $response;
    }

    private function codeFrom(string $launchUrl): string
    {
        parse_str((string) parse_url($launchUrl, PHP_URL_QUERY), $query);

        return (string) ($query['acesso'] ?? '');
    }

    private function redeem(string $launchUrl): string
    {
        $response = $this->postJson('/api/support-access/mobile/redeem', [
            'code' => $this->codeFrom($launchUrl),
        ])->assertOk();
        $this->app['auth']->forgetGuards();

        return (string) $response->json('body.token');
    }

    public function test_super_admin_opens_the_app_as_the_student_without_the_password(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [$superAdmin, $saToken] = $this->superAdminSession();
        ['student' => $student, 'user' => $studentUser] = $this->studentWithApp($tenant);

        $response = $this->start($saToken, $student)
            ->assertOk()
            ->assertJsonPath('body.student.id', $student->id);

        $launchUrl = $response->json('body.launch_url');
        $this->assertStringStartsWith('http://localhost:8081/?acesso=', $launchUrl);
        $this->assertStringNotContainsString($saToken, $launchUrl);

        $access = SupportAccess::sole();
        $this->assertSame($superAdmin->id, $access->user_id);
        $this->assertSame($studentUser->id, $access->impersonated_user_id);

        $token = $this->redeem($launchUrl);
        $stored = PersonalAccessToken::findToken($token);
        $this->assertSame($studentUser->id, $stored->tokenable_id);
        $this->assertSame(["support-access:{$access->id}"], $stored->abilities);

        $this->withToken($token)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('id', $studentUser->id)
            ->assertJsonPath('role', 'aluno')
            ->assertJsonPath('password_change_required', false)
            ->assertJsonPath('support_access.expires_at', $access->expires_at->toIso8601String());

        $this->assertSame(0, DB::table('student_activity_days')->count());
    }

    public function test_handoff_code_is_single_use_and_a_new_access_revokes_the_previous_app_token(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [, $saToken] = $this->superAdminSession();
        ['student' => $student] = $this->studentWithApp($tenant);

        $firstUrl = $this->start($saToken, $student)->json('body.launch_url');
        $firstToken = $this->redeem($firstUrl);

        $this->postJson('/api/support-access/mobile/redeem', ['code' => $this->codeFrom($firstUrl)])
            ->assertUnprocessable();

        $secondUrl = $this->start($saToken, $student)->json('body.launch_url');
        $this->assertNull(PersonalAccessToken::findToken($firstToken));
        $this->assertSame(1, SupportAccess::whereNull('ended_at')->count());

        $secondToken = $this->redeem($secondUrl);
        $this->withToken($secondToken)->getJson('/api/me')->assertOk()->assertJsonPath('role', 'aluno');
    }

    public function test_opening_the_app_does_not_end_an_open_tenant_access(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [, $saToken] = $this->superAdminSession();
        ['student' => $student] = $this->studentWithApp($tenant);

        $tenantToken = $this->withToken($saToken)->postJson("/api/tenants/{$tenant->id}/access", [
            'reason_id' => $this->reasonId(),
            'duration_minutes' => 60,
        ])->json('body.token');
        $this->app['auth']->forgetGuards();

        $this->start($saToken, $student)->assertOk();

        $this->withToken($tenantToken)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('selected_tenant_id', $tenant->id);
        $this->assertSame(2, SupportAccess::whereNull('ended_at')->count());
    }

    public function test_support_session_can_enter_a_blocked_account_and_cannot_change_the_password(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [, $saToken] = $this->superAdminSession();
        ['student' => $student, 'user' => $studentUser] = $this->studentWithApp($tenant);

        $token = $this->redeem($this->start($saToken, $student)->json('body.launch_url'));
        $studentUser->update(['status' => 'inactive']);

        $this->withToken($token)->getJson('/api/me')->assertOk()->assertJsonPath('role', 'aluno');
        $this->app['auth']->forgetGuards();

        $this->withToken($token)->putJson('/api/me/password', [
            'current_password' => 'password',
            'password' => 'nova-senha-1',
            'password_confirmation' => 'nova-senha-1',
        ])->assertForbidden();

        $this->assertTrue(Hash::check('password', (string) $studentUser->fresh()->password));
    }

    public function test_logout_ends_the_access_and_mutations_are_recorded(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [, $saToken] = $this->superAdminSession();
        ['student' => $student] = $this->studentWithApp($tenant);
        $token = $this->redeem($this->start($saToken, $student)->json('body.launch_url'));

        $this->withToken($token)->getJson('/api/me')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->putJson('/api/me/password', [])->assertForbidden();
        $this->app['auth']->forgetGuards();

        $actions = SupportAccess::sole()->actions()->get();
        $this->assertCount(1, $actions);
        $this->assertSame('PUT', $actions[0]->method);
        $this->assertSame('/api/me/password', $actions[0]->path);

        $this->withToken($token)->postJson('/api/logout')->assertOk();
        $this->app['auth']->forgetGuards();

        $this->assertNotNull(SupportAccess::sole()->ended_at);
        $this->assertNull(PersonalAccessToken::findToken($token));
        $this->withToken($saToken)->getJson('/api/me')->assertOk();
    }

    public function test_only_super_admin_can_open_the_app_and_the_student_needs_an_account(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        ['student' => $student] = $this->studentWithApp($tenant);

        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $this->actingAs($admin)->postJson("/api/students/{$student->id}/mobile-access", [
            'reason_id' => $this->reasonId(),
            'duration_minutes' => 60,
        ])->assertForbidden();
        $this->app['auth']->forgetGuards();

        $withoutApp = Student::factory()->create(['tenant_id' => $tenant->id, 'user_id' => null]);
        [, $saToken] = $this->superAdminSession();
        $this->start($saToken, $withoutApp)->assertUnprocessable()->assertJsonValidationErrors('student');
        $this->start($saToken, $student, ['reason_id' => $this->reasonId(true), 'details' => 'curto'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('details');

        $this->assertSame(0, SupportAccess::count());
    }

    public function test_history_names_the_student(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        [, $saToken] = $this->superAdminSession();
        ['student' => $student] = $this->studentWithApp($tenant);
        $this->start($saToken, $student);

        $this->withToken($saToken)
            ->getJson("/api/support-access/history?tenant={$tenant->id}")
            ->assertOk()
            ->assertJsonPath('body.items.0.student.name', 'MARIA DA SILVA')
            ->assertJsonPath('body.items.0.student.enrollment_number', '202600099');
    }

    public function test_a_normal_student_session_still_records_activity(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        ['user' => $studentUser] = $this->studentWithApp($tenant);
        $token = $studentUser->createToken('api-token')->plainTextToken;

        $this->withToken($token)->getJson('/api/me')->assertOk();

        $this->assertSame(1, DB::table('student_activity_days')->count());
    }
}
