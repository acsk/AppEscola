<?php

namespace Database\Factories;

use App\Models\OfficialAssessment;
use App\Models\SchoolClass;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

class OfficialAssessmentFactory extends Factory
{
    protected $model = OfficialAssessment::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'school_class_id' => SchoolClass::factory(),
            'title' => 'Simulado ' . fake()->words(2, true),
            'kind' => 'presencial_bimestral',
            'assessment_date' => fake()->dateTimeBetween('-1 month', 'now')->format('Y-m-d'),
            'max_score' => 10,
            'weight' => 1,
            'counts_towards_report_card' => true,
            'status' => OfficialAssessment::STATUS_DRAFT,
        ];
    }

    public function published(): static
    {
        return $this->state(fn () => ['status' => OfficialAssessment::STATUS_PUBLISHED]);
    }
}
