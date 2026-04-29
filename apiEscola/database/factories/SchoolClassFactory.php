<?php

namespace Database\Factories;

use App\Models\Course;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

class SchoolClassFactory extends Factory
{
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'course_id' => Course::factory(),
            'name' => 'Turma ' . fake()->bothify('??-##'),
            'year' => (int) fake()->year(),
            'period' => fake()->randomElement(['morning', 'afternoon', 'night', 'full_time']),
            'capacity' => fake()->numberBetween(20, 50),
            'status' => 'active',
        ];
    }
}
