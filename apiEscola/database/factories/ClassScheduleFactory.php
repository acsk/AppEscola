<?php

namespace Database\Factories;

use App\Models\SchoolClass;
use App\Models\Subject;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class ClassScheduleFactory extends Factory
{
    public function definition(): array
    {
        $start = fake()->time('H:i:s', strtotime('18:00:00'));

        return [
            'tenant_id' => Tenant::factory(),
            'school_class_id' => SchoolClass::factory(),
            'subject_id' => Subject::factory(),
            'teacher_id' => null,
            'weekday' => fake()->randomElement(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
            'start_time' => $start,
            'end_time' => date('H:i:s', strtotime($start) + 3600),
            'room' => 'Sala ' . fake()->numberBetween(1, 10),
        ];
    }
}
