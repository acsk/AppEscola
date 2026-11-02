<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\ExamType;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Bi\PriorityTopics;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class BiPriorityTopicsTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    public function test_coordination_sets_priorities_and_course_target(): void
    {
        $tenant = Tenant::factory()->create();
        $examType = ExamType::query()->firstOrFail();
        $math = Subject::create(['tenant_id' => $tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $fractions = SubjectTopic::create(['tenant_id' => $tenant->id, 'subject_id' => $math->id, 'name' => 'Frações']);
        $percent = SubjectTopic::create(['tenant_id' => $tenant->id, 'subject_id' => $math->id, 'name' => 'Porcentagem']);
        $foreignTopic = SubjectTopic::create([
            'tenant_id' => ($other = Tenant::factory()->create())->id,
            'subject_id' => Subject::create(['tenant_id' => $other->id, 'name' => 'X', 'status' => 'active'])->id,
            'name' => 'Outro',
        ]);
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'coordenador']));

        // Curso aponta o concurso alvo (campo novo, opcional).
        $course = $this->postJson('/api/courses', ['name' => 'Preparatório', 'target_exam_type_id' => $examType->id])
            ->assertCreated()
            ->assertJsonPath('body.target_exam_type_id', $examType->id)
            ->json('body');

        $url = "/api/bi/priorities/{$examType->id}";
        $this->getJson($url)->assertOk()->assertJsonPath('body.configured', false);

        $this->putJson($url, ['topics' => [['topic_id' => $fractions->id, 'weight' => 5], ['topic_id' => $percent->id, 'weight' => 0]]])
            ->assertOk()
            ->assertJsonPath('body.configured', true)
            ->assertJsonPath('body.courses.0.id', $course['id'])
            ->assertJsonPath('body.subjects.0.topics.0.weight', 5)
            ->assertJsonPath('body.subjects.0.topics.1.weight', 0);

        $resolved = app(PriorityTopics::class)->resolve($tenant->id, $examType->id, [$math->id]);
        $this->assertSame([$fractions->id => 5], $resolved['weights']);
        $this->assertFalse($resolved['provisional']);

        // Sem cadastro: todos os assuntos valem 1, provisório.
        $fallback = app(PriorityTopics::class)->resolve($tenant->id, null, [$math->id]);
        $this->assertTrue($fallback['provisional']);
        $this->assertEqualsCanonicalizing([$fractions->id, $percent->id], array_keys($fallback['weights']));

        $this->putJson($url, ['topics' => [['topic_id' => $foreignTopic->id, 'weight' => 3]]])->assertStatus(422);
        $this->putJson($url, ['topics' => [['topic_id' => $fractions->id, 'weight' => 9]]])->assertStatus(422);
        $this->getJson('/api/bi/priorities/999999')->assertNotFound();
    }

    public function test_teacher_reads_but_cannot_change(): void
    {
        $tenant = Tenant::factory()->create();
        $examType = ExamType::query()->firstOrFail();
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'professor']));

        $this->getJson("/api/bi/priorities/{$examType->id}")->assertOk();
        $this->putJson("/api/bi/priorities/{$examType->id}", ['topics' => []])->assertForbidden();
    }
}
