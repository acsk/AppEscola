<?php

namespace Database\Factories;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

class GuardianFactory extends Factory
{
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'user_id' => null,
            'name' => fake()->name(),
            'document' => fake()->numerify('###.###.###-##'),
            'email' => fake()->unique()->safeEmail(),
            'phone' => fake()->phoneNumber(),
            'relationship' => fake()->randomElement(['pai', 'mae', 'avo_paterno', 'avo_materno', 'tio', 'responsavel_legal', 'outro']),
        ];
    }
}
