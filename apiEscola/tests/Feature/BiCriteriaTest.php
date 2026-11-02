<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class BiCriteriaTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    public function test_coordination_saves_criteria_used_by_every_screen(): void
    {
        $tenant = Tenant::factory()->create();
        $other = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'coordenador']));

        $this->getJson('/api/bi/criteria')->assertOk()->assertJsonPath('body.criteria.goal_pct', 70);

        $this->putJson('/api/bi/criteria', ['goal_pct' => 60, 'dedication_days_per_week' => 3.5])
            ->assertOk()
            ->assertJsonPath('body.criteria.goal_pct', 60)
            ->assertJsonPath('body.criteria.dedication_days_per_week', 3.5)
            ->assertJsonPath('body.criteria.profile_min_questions', 50);

        // A meta da escola chega aos cálculos (meta e visão geral).
        $this->getJson('/api/bi/meta')->assertOk()->assertJsonPath('body.defaults.goal_pct', 60);
        $this->getJson('/api/bi/overview')->assertOk()->assertJsonPath('body.meta.goal_pct', 60);

        // Outra escola continua com o padrão.
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $other->id, 'role' => 'admin']));
        $this->getJson('/api/bi/criteria')->assertOk()->assertJsonPath('body.criteria.goal_pct', 70);
    }

    public function test_validation_and_teacher_cannot_change(): void
    {
        $tenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']));
        $this->putJson('/api/bi/criteria', ['goal_pct' => 10])->assertStatus(422);
        $this->putJson('/api/bi/criteria', ['profile_min_assessments' => 2.5])->assertStatus(422);

        Sanctum::actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'professor']));
        $this->getJson('/api/bi/criteria')->assertOk();
        $this->putJson('/api/bi/criteria', ['goal_pct' => 60])->assertForbidden();
    }
}
