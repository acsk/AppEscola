<?php

namespace Database\Factories;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

class StudentFactory extends Factory
{
    public function definition(): array
    {
        $isMinor = fake()->boolean(40);

        return [
            'tenant_id' => Tenant::factory(),
            'user_id' => null,
            'name' => fake()->name(),
            'birth_date' => $isMinor
                ? fake()->dateTimeBetween('-17 years', '-5 years')->format('Y-m-d')
                : fake()->dateTimeBetween('-50 years', '-18 years')->format('Y-m-d'),
            'document' => fake()->numerify('###.###.###-##'),
            'email' => fake()->unique()->safeEmail(),
            'phone' => fake()->phoneNumber(),
            'is_minor' => $isMinor,
            'status' => 'active',
        ];
    }
}
