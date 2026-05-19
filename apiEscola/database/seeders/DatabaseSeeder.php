<?php

namespace Database\Seeders;

use App\Models\Course;
use App\Models\Guardian;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // Domínios (deve rodar primeiro — FKs dependem desses dados)
        $this->call(DomainSeeder::class);

        // Super Admin
        User::factory()->superAdmin()->create([
            'name' => 'Super Admin',
            'email' => 'andrecabrall@gmail.com',
            'password' => Hash::make('123456'),
        ]);

        // Tenant de demonstração
        $tenant = Tenant::factory()->create([
            'corporate_name' => 'Cursinho Exemplo Educação LTDA',
            'trade_name'     => 'Cursinho Exemplo',
            'name'           => 'Cursinho Exemplo',
            'slug'           => 'cursinho-exemplo',
            'cnpj'           => '12.345.678/0001-99',
            'email'          => 'contato@cursinhoexemplo.com',
            'phone'          => '(11) 3000-0000',
            'whatsapp'       => '(11) 99000-0000',
            'zip_code'       => '01310-100',
            'street'         => 'Avenida Paulista',
            'number'         => '1000',
            'complement'     => 'Sala 201',
            'neighborhood'   => 'Bela Vista',
            'city'           => 'São Paulo',
            'state'          => 'SP',
        ]);

        // Admin do tenant
        User::factory()->admin()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Admin Escola',
            'email' => 'admin@cursinhoexemplo.com',
            'password' => Hash::make('123456'),
        ]);

        // Cursos
        $courses = Course::factory(3)->create(['tenant_id' => $tenant->id]);

        // Disciplinas
        Subject::factory()->createMany([
            ['tenant_id' => $tenant->id, 'name' => 'Matemática'],
            ['tenant_id' => $tenant->id, 'name' => 'Português'],
            ['tenant_id' => $tenant->id, 'name' => 'Física'],
            ['tenant_id' => $tenant->id, 'name' => 'Química'],
            ['tenant_id' => $tenant->id, 'name' => 'Redação'],
        ]);

        // Turmas
        $courses->each(function ($course) use ($tenant) {
            SchoolClass::factory(2)->create([
                'tenant_id' => $tenant->id,
                'course_id' => $course->id,
            ]);
        });

        // Alunos
        $students = Student::factory(10)->create(['tenant_id' => $tenant->id]);

        // Responsáveis (para os alunos menores)
        $students->where('is_minor', true)->each(function ($student) use ($tenant) {
            $guardian = Guardian::factory()->create(['tenant_id' => $tenant->id]);
            $student->guardians()->attach($guardian->id, [
                'tenant_id' => $tenant->id,
                'is_financial_responsible' => true,
                'is_pedagogical_responsible' => true,
                'can_access_portal' => true,
            ]);
        });

        // Simulado de demonstração
        $this->call(ExamSeeder::class);

        // Alunos adicionais matriculados na turma 1 (id 5)
        $this->call(TurmaUmStudentsSeeder::class);

        // Configurações de cobrança por tenant (preset hybrid por padrão)
        $this->call(TenantBillingSettingsSeeder::class);
    }
}
