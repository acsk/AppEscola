<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DomainSeeder extends Seeder
{
    public function run(): void
    {
        // Status genérico
        DB::table('domain_statuses')->insertOrIgnore([
            ['slug' => 'active',    'name' => 'Ativo'],
            ['slug' => 'inactive',  'name' => 'Inativo'],
            ['slug' => 'suspended', 'name' => 'Suspenso'],
            ['slug' => 'closed',    'name' => 'Encerrado'],
        ]);

        // Papéis de usuário
        DB::table('domain_user_roles')->insertOrIgnore([
            ['slug' => 'super_admin', 'name' => 'Super Administrador'],
            ['slug' => 'admin',       'name' => 'Administrador'],
            ['slug' => 'secretaria',  'name' => 'Secretaria'],
            ['slug' => 'professor',   'name' => 'Professor'],
            ['slug' => 'aluno',       'name' => 'Aluno'],
            ['slug' => 'responsavel', 'name' => 'Responsável'],
        ]);

        // Períodos de aula
        DB::table('domain_periods')->insertOrIgnore([
            ['slug' => 'morning',   'name' => 'Manhã',    'order' => 1],
            ['slug' => 'afternoon', 'name' => 'Tarde',    'order' => 2],
            ['slug' => 'night',     'name' => 'Noite',    'order' => 3],
            ['slug' => 'full_time', 'name' => 'Integral', 'order' => 4],
        ]);

        // Dias da semana
        DB::table('domain_weekdays')->insertOrIgnore([
            ['slug' => 'monday',    'name' => 'Segunda-feira', 'order' => 1],
            ['slug' => 'tuesday',   'name' => 'Terça-feira',   'order' => 2],
            ['slug' => 'wednesday', 'name' => 'Quarta-feira',  'order' => 3],
            ['slug' => 'thursday',  'name' => 'Quinta-feira',  'order' => 4],
            ['slug' => 'friday',    'name' => 'Sexta-feira',   'order' => 5],
            ['slug' => 'saturday',  'name' => 'Sábado',        'order' => 6],
            ['slug' => 'sunday',    'name' => 'Domingo',       'order' => 7],
        ]);

        // Relacionamentos responsável-aluno
        DB::table('domain_guardian_relationships')->insertOrIgnore([
            ['slug' => 'pai',              'name' => 'Pai'],
            ['slug' => 'mae',              'name' => 'Mãe'],
            ['slug' => 'avo_paterno',      'name' => 'Avô Paterno'],
            ['slug' => 'avo_materno',      'name' => 'Avó Materna'],
            ['slug' => 'tio',              'name' => 'Tio(a)'],
            ['slug' => 'responsavel_legal','name' => 'Responsável Legal'],
            ['slug' => 'outro',            'name' => 'Outro'],
        ]);

        // Métodos de pagamento
        DB::table('domain_payment_methods')->insertOrIgnore([
            ['slug' => 'cash',        'name' => 'Dinheiro'],
            ['slug' => 'pix',         'name' => 'PIX'],
            ['slug' => 'credit_card', 'name' => 'Cartão de Crédito'],
            ['slug' => 'debit_card',  'name' => 'Cartão de Débito'],
            ['slug' => 'bank_slip',   'name' => 'Boleto Bancário'],
            ['slug' => 'transfer',    'name' => 'Transferência Bancária'],
            ['slug' => 'hybrid',      'name' => 'Boleto + PIX'],
        ]);

        // Status de matrícula
        DB::table('domain_enrollment_statuses')->insertOrIgnore([
            ['slug' => 'pending',   'name' => 'Pendente'],
            ['slug' => 'active',    'name' => 'Ativa'],
            ['slug' => 'concluded', 'name' => 'Concluída'],
            ['slug' => 'cancelled', 'name' => 'Cancelada'],
            ['slug' => 'locked',    'name' => 'Trancada'],
        ]);

        // Status de cobrança
        DB::table('domain_invoice_statuses')->insertOrIgnore([
            ['slug' => 'pending',   'name' => 'Pendente'],
            ['slug' => 'paid',      'name' => 'Paga'],
            ['slug' => 'overdue',   'name' => 'Vencida'],
            ['slug' => 'cancelled', 'name' => 'Cancelada'],
        ]);

        // Ciclos de cobrança
        DB::table('domain_billing_cycles')->insertOrIgnore([
            ['slug' => 'monthly',       'name' => 'Mensal',         'months' => 1,  'order' => 1],
            ['slug' => 'bimonthly',     'name' => 'Bimestral',      'months' => 2,  'order' => 2],
            ['slug' => 'quadrimestral', 'name' => 'Quadrimestral',  'months' => 4,  'order' => 3],
            ['slug' => 'semiannual',    'name' => 'Semestral',      'months' => 6,  'order' => 4],
            ['slug' => 'annual',        'name' => 'Anual',          'months' => 12, 'order' => 5],
        ]);

        // Tipos de cobrança
        DB::table('domain_invoice_types')->insertOrIgnore([
            ['slug' => 'enrollment_fee', 'name' => 'Taxa de Matrícula'],
            ['slug' => 'monthly',        'name' => 'Mensalidade'],
            ['slug' => 'uniform',        'name' => 'Fardamento'],
            ['slug' => 'material',       'name' => 'Material Didático'],
            ['slug' => 'transport',      'name' => 'Transporte'],
            ['slug' => 'late_fee',       'name' => 'Multa/Juros'],
            ['slug' => 'other',          'name' => 'Outro'],
        ]);

        $this->call(ExamTypeSeeder::class);
    }
}
