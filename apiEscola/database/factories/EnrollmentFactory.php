<?php

namespace Database\Factories;

use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class EnrollmentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'student_id' => Student::factory(),
            'school_class_id' => SchoolClass::factory(),
            'enrollment_number' => strtoupper(Str::random(8)),
            'start_date' => fake()->dateTimeThisYear()->format('Y-m-d'),
            'end_date' => null,
            'status' => 'active',
            'monthly_amount' => fake()->randomFloat(2, 150, 1500),
            'discount_amount' => fake()->optional()->randomFloat(2, 10, 200),
            'payment_due_day' => fake()->numberBetween(1, 28),
        ];
    }
}
