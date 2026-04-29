<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class TenantFactory extends Factory
{
    public function definition(): array
    {
        $corporateName = fake()->company() . ' ' . fake()->randomElement(['LTDA', 'S/A', 'ME', 'EIRELI']);
        $tradeName = fake()->company();

        return [
            'corporate_name' => $corporateName,
            'trade_name'     => $tradeName,
            'name'           => $tradeName,
            'slug'           => Str::slug($tradeName) . '-' . fake()->unique()->numberBetween(100, 999),
            'cnpj'           => fake()->numerify('##.###.###/####-##'),
            'email'          => fake()->unique()->companyEmail(),
            'phone'          => fake()->numerify('(##) ####-####'),
            'whatsapp'       => fake()->numerify('(##) #####-####'),
            'zip_code'       => fake()->numerify('#####-###'),
            'street'         => fake()->streetName(),
            'number'         => (string) fake()->buildingNumber(),
            'complement'     => null,
            'neighborhood'   => fake()->word(),
            'city'           => fake()->city(),
            'state'          => fake()->stateAbbr(),
            'status'         => 'active',
            'settings'       => null,
        ];
    }
}
