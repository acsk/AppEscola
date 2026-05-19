<?php

namespace Database\Factories;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

class CourseFactory extends Factory
{
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'name' => fake()->randomElement([
                'Pré-ENEM', 'Pré-Militar', 'Reforço Escolar',
                'Redação', 'Matemática Intensivo', 'Ciências da Natureza',
            ]),
            'enrollment_fee_amount' => fake()->randomFloat(2, 0, 250),
            'description' => fake()->sentence(),
            'status' => 'active',
        ];
    }
}
