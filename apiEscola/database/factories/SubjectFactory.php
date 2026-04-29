<?php

namespace Database\Factories;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

class SubjectFactory extends Factory
{
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'name' => fake()->randomElement([
                'Matemática', 'Português', 'Física', 'Química',
                'Biologia', 'História', 'Geografia', 'Redação',
                'Inglês', 'Filosofia', 'Sociologia',
            ]),
            'description' => fake()->sentence(),
            'status' => 'active',
        ];
    }
}
