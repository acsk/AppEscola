<?php

namespace Database\Factories;

use App\Models\Enrollment;
use App\Models\Student;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

class InvoiceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'enrollment_id' => null,
            'student_id' => Student::factory(),
            'guardian_id' => null,
            'description' => 'Mensalidade ' . fake()->monthName() . '/' . fake()->year(),
            'amount' => fake()->randomFloat(2, 100, 1500),
            'due_date' => fake()->dateTimeThisYear()->format('Y-m-d'),
            'paid_at' => null,
            'status' => 'pending',
            'payment_method' => null,
            'notes' => null,
        ];
    }
}
