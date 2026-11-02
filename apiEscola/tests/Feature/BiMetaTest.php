<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\Course;
use App\Models\SchoolClass;
use App\Models\Subject;
use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class BiMetaTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    /** Views (ex.: vw_dashboard_tenant_summary) sobrevivem ao migrate:fresh sem isto. */
    protected bool $dropViews = true;

    /** @return array{tenant: Tenant, course: Course, classA: SchoolClass, classB: SchoolClass, subject: Subject} */
    private function seedTenant(): array
    {
        $tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $tenant->id]);
        $classA = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $classB = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $subject = Subject::factory()->create(['tenant_id' => $tenant->id]);

        return compact('tenant', 'course', 'classA', 'classB', 'subject');
    }

    private function user(Tenant $tenant, string $role): User
    {
        return User::factory()->create(['tenant_id' => $tenant->id, 'role' => $role]);
    }

    public function test_admin_sees_tenant_wide_options_and_only_delivered_sections(): void
    {
        $ctx = $this->seedTenant();
        $other = $this->seedTenant();
        Sanctum::actingAs($this->user($ctx['tenant'], 'admin'));

        $response = $this->getJson('/api/bi/meta')->assertOk()->assertJsonPath('type', 'success');

        $classIds = collect($response->json('body.filter_options.school_classes'))->pluck('id');
        $this->assertEqualsCanonicalizing([$ctx['classA']->id, $ctx['classB']->id], $classIds->all());
        $this->assertNotContains($other['classA']->id, $classIds->all());
        $response->assertJsonPath('body.scope.tenant_wide', true)
            ->assertJsonPath('body.features.enabled', true)
            ->assertJsonPath('body.defaults.goal_pct', 70);
        $this->assertCount(13, $response->json('body.sections'));
        $available = collect($response->json('body.sections'))->where('available', true)->pluck('key')->all();
        $this->assertSame(['overview', 'subjects'], $available);
    }

    public function test_coordinator_has_tenant_wide_scope(): void
    {
        $ctx = $this->seedTenant();
        Sanctum::actingAs($this->user($ctx['tenant'], 'coordenador'));

        $this->getJson('/api/bi/meta')
            ->assertOk()
            ->assertJsonPath('body.scope.role', 'coordenador')
            ->assertJsonPath('body.scope.tenant_wide', true)
            ->assertJsonCount(2, 'body.filter_options.school_classes');
    }

    public function test_teacher_only_sees_classes_and_subjects_they_teach(): void
    {
        $ctx = $this->seedTenant();
        $classC = SchoolClass::factory()->create(['tenant_id' => $ctx['tenant']->id, 'course_id' => $ctx['course']->id]);
        $otherSubject = Subject::factory()->create(['tenant_id' => $ctx['tenant']->id]);
        $teacher = $this->user($ctx['tenant'], 'professor');
        $this->user($ctx['tenant'], 'professor');

        // Vínculo pelo pivô (padrão atual).
        $schedule = ClassSchedule::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['classA']->id,
            'subject_id' => $ctx['subject']->id,
        ]);
        DB::table('class_schedule_user')->insert([
            'tenant_id' => $ctx['tenant']->id,
            'class_schedule_id' => $schedule->id,
            'user_id' => $teacher->id,
        ]);
        // Vínculo legado por teacher_id.
        ClassSchedule::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $classC->id,
            'subject_id' => $ctx['subject']->id,
            'teacher_id' => $teacher->id,
        ]);
        // Horário excluído não dá acesso.
        ClassSchedule::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['classB']->id,
            'subject_id' => $otherSubject->id,
            'teacher_id' => $teacher->id,
        ])->delete();

        Sanctum::actingAs($teacher);
        $response = $this->getJson('/api/bi/meta')->assertOk()->assertJsonPath('body.scope.tenant_wide', false);

        $this->assertEqualsCanonicalizing(
            [$ctx['classA']->id, $classC->id],
            collect($response->json('body.filter_options.school_classes'))->pluck('id')->all(),
        );
        $this->assertSame([$ctx['subject']->id], collect($response->json('body.filter_options.subjects'))->pluck('id')->all());
        $this->assertSame([$teacher->id], collect($response->json('body.filter_options.teachers'))->pluck('id')->all());
    }

    public function test_teacher_without_classes_sees_no_class(): void
    {
        $ctx = $this->seedTenant();
        Sanctum::actingAs($this->user($ctx['tenant'], 'professor'));

        $this->getJson('/api/bi/meta')->assertOk()->assertJsonCount(0, 'body.filter_options.school_classes');
    }

    public function test_roles_without_bi_access_are_forbidden(): void
    {
        $ctx = $this->seedTenant();

        foreach (['secretaria', 'aluno', 'responsavel'] as $role) {
            Sanctum::actingAs($this->user($ctx['tenant'], $role));
            $this->getJson('/api/bi/meta')->assertForbidden();
            $this->getJson('/api/bi/metrics')->assertForbidden();
        }
    }

    public function test_disabled_tenant_gets_feature_code(): void
    {
        $ctx = $this->seedTenant();
        TenantSetting::create([
            'tenant_id' => $ctx['tenant']->id,
            'module' => 'bi',
            'key' => 'enabled',
            'value' => TenantSetting::wrapValue(false),
        ]);
        Sanctum::actingAs($this->user($ctx['tenant'], 'admin'));

        $this->getJson('/api/bi/meta')
            ->assertForbidden()
            ->assertJsonPath('body.code', 'bi_feature_disabled');
    }

    public function test_super_admin_needs_tenant_context(): void
    {
        $ctx = $this->seedTenant();
        Sanctum::actingAs(User::factory()->superAdmin()->create());

        $this->getJson('/api/bi/meta')->assertStatus(422);
        $this->getJson('/api/bi/meta?tenant_id=' . $ctx['tenant']->id)
            ->assertOk()
            ->assertJsonCount(2, 'body.filter_options.school_classes');
    }

    public function test_metrics_catalog_is_served(): void
    {
        $ctx = $this->seedTenant();
        Sanctum::actingAs($this->user($ctx['tenant'], 'admin'));

        $metrics = collect($this->getJson('/api/bi/metrics')->assertOk()->json('body.metrics'));

        $this->assertSame(array_keys(config('bi_metrics')), $metrics->pluck('key')->all());
        $this->assertSame('pct', $metrics->firstWhere('key', 'attendance.rate')['unit']);
    }
}
