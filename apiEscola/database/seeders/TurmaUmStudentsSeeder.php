<?php

namespace Database\Seeders;

use App\Models\CoursePlan;
use App\Models\Enrollment;
use App\Models\Guardian;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class TurmaUmStudentsSeeder extends Seeder
{
    public function run(): void
    {
        $tenant = Tenant::query()->findOrFail(1);
        $schoolClass = SchoolClass::query()->where('tenant_id', $tenant->id)->findOrFail(5);
        $coursePlan = CoursePlan::query()->where('tenant_id', $tenant->id)->findOrFail(1);

        $students = [
            [
                'enrollment_number' => '202600012',
                'name' => 'Maria Eduarda Lima',
                'birth_date' => '2014-03-18',
                'document' => '15972997402',
                'email' => 'maria.eduarda.turma1@appescola.test',
                'phone' => '82988370001',
                'is_minor' => true,
                'student_enrollment_number' => 'MAT-1-00003',
            ],
            [
                'enrollment_number' => '202600013',
                'name' => 'Joao Pedro Santos',
                'birth_date' => '2013-11-07',
                'document' => '15972997403',
                'email' => 'joao.pedro.turma1@appescola.test',
                'phone' => '82988370002',
                'is_minor' => true,
                'student_enrollment_number' => 'MAT-1-00004',
            ],
            [
                'enrollment_number' => '202600014',
                'name' => 'Ana Clara Souza',
                'birth_date' => '2015-01-22',
                'document' => '15972997404',
                'email' => 'ana.clara.turma1@appescola.test',
                'phone' => '82988370003',
                'is_minor' => true,
                'student_enrollment_number' => 'MAT-1-00005',
            ],
            [
                'enrollment_number' => '202600015',
                'name' => 'Lucas Gabriel Alves',
                'birth_date' => '2014-06-30',
                'document' => '15972997405',
                'email' => 'lucas.gabriel.turma1@appescola.test',
                'phone' => '82988370004',
                'is_minor' => true,
                'student_enrollment_number' => 'MAT-1-00006',
            ],
            [
                'enrollment_number' => '202600016',
                'name' => 'Helena Martins',
                'birth_date' => '2013-09-12',
                'document' => '15972997406',
                'email' => 'helena.martins.turma1@appescola.test',
                'phone' => '82988370005',
                'is_minor' => true,
                'student_enrollment_number' => 'MAT-1-00007',
            ],
            [
                'enrollment_number' => '202600017',
                'name' => 'Pedro Henrique Costa',
                'birth_date' => '2014-12-05',
                'document' => '15972997407',
                'email' => 'pedro.henrique.turma1@appescola.test',
                'phone' => '82988370006',
                'is_minor' => true,
                'student_enrollment_number' => 'MAT-1-00008',
            ],
            [
                'enrollment_number' => '202600018',
                'name' => 'Laura Beatriz Rocha',
                'birth_date' => '2015-04-09',
                'document' => '15972997408',
                'email' => 'laura.beatriz.turma1@appescola.test',
                'phone' => '82988370007',
                'is_minor' => true,
                'student_enrollment_number' => 'MAT-1-00009',
            ],
            [
                'enrollment_number' => '202600019',
                'name' => 'Arthur Miguel Ferreira',
                'birth_date' => '2013-02-14',
                'document' => '15972997409',
                'email' => 'arthur.miguel.turma1@appescola.test',
                'phone' => '82988370008',
                'is_minor' => true,
                'student_enrollment_number' => 'MAT-1-00010',
            ],
            [
                'enrollment_number' => '202600020',
                'name' => 'Sophia Oliveira',
                'birth_date' => '2014-08-21',
                'document' => '15972997410',
                'email' => 'sophia.oliveira.turma1@appescola.test',
                'phone' => '82988370009',
                'is_minor' => true,
                'student_enrollment_number' => 'MAT-1-00011',
            ],
        ];

        foreach ($students as $index => $data) {
            $user = User::query()->updateOrCreate(
                ['email' => $data['email']],
                [
                    'tenant_id' => $tenant->id,
                    'name' => $data['name'],
                    'password' => Hash::make('123456'),
                    'role' => 'aluno',
                    'status' => 'active',
                ]
            );

            $student = Student::query()->updateOrCreate(
                ['document' => $data['document']],
                [
                    'tenant_id' => $tenant->id,
                    'user_id' => $user->id,
                    'enrollment_number' => $data['enrollment_number'],
                    'name' => $data['name'],
                    'birth_date' => $data['birth_date'],
                    'email' => $data['email'],
                    'phone' => $data['phone'],
                    'is_minor' => $data['is_minor'],
                    'status' => 'active',
                ]
            );

            if ($student->is_minor) {
                $guardian = Guardian::query()->updateOrCreate(
                    ['document' => '259729974' . str_pad((string) ($index + 2), 2, '0', STR_PAD_LEFT)],
                    [
                        'tenant_id' => $tenant->id,
                        'name' => 'Responsavel de ' . $data['name'],
                        'email' => 'responsavel.' . ($index + 2) . '.turma1@appescola.test',
                        'phone' => '829884800' . str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT),
                        'relationship' => 'mae',
                    ]
                );

                $student->guardians()->syncWithoutDetaching([
                    $guardian->id => [
                        'tenant_id' => $tenant->id,
                        'is_financial_responsible' => true,
                        'is_pedagogical_responsible' => true,
                        'can_access_portal' => true,
                    ],
                ]);
            }

            Enrollment::query()->updateOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'student_id' => $student->id,
                    'school_class_id' => $schoolClass->id,
                ],
                [
                    'course_plan_id' => $coursePlan->id,
                    'bundle_id' => null,
                    'enrollment_number' => $data['student_enrollment_number'],
                    'start_date' => '2026-05-04',
                    'end_date' => $schoolClass->end_date?->toDateString() ?? '2026-12-30',
                    'status' => 'active',
                    'monthly_amount' => $coursePlan->monthlyEquivalent(),
                    'discount_amount' => 0,
                    'payment_due_day' => 3,
                ]
            );
        }
    }
}
