<?php

namespace Database\Seeders;

use App\Models\SaasPlan;
use Illuminate\Database\Seeder;

/**
 * Planos sugeridos (Básico, Profissional, Enterprise). Opcional: `php artisan db:seed --class=SaasPlanSeeder`.
 * Não sobrescreve planos existentes; nomes, preços e limites se ajustam depois na tela de Planos SaaS.
 */
class SaasPlanSeeder extends Seeder
{
    public function run(): void
    {
        $basic = ['academic', 'exams'];
        $pro = [...$basic, 'question_bank', 'ranking', 'finance', 'bank_reconciliation', 'communication', 'visual_customization', 'advanced_export'];
        $enterprise = [...$pro, 'bi', 'ai', 'ai_insights'];

        $plans = [
            ['slug' => 'basico', 'name' => 'Básico', 'description' => 'Gestão de alunos, turmas, cursos, matrículas e simulados.', 'price_monthly' => 0, 'trial_days' => 14, 'order' => 1, 'features' => $basic,
                'limits' => ['students' => 200, 'users' => 5, 'teachers' => 10, 'classes' => 20, 'courses' => 10, 'questions' => 2000, 'exams' => 100, 'ai_question_generations' => 0, 'document_processing' => 0]],
            ['slug' => 'profissional', 'name' => 'Profissional', 'description' => 'Tudo do Básico, com banco de questões, ranking, financeiro e personalização.', 'price_monthly' => 0, 'trial_days' => 14, 'order' => 2, 'features' => $pro,
                'limits' => ['students' => 1000, 'users' => 20, 'teachers' => 50, 'classes' => 100, 'courses' => 50, 'questions' => 20000, 'exams' => 1000, 'ai_question_generations' => 0, 'document_processing' => 50]],
            ['slug' => 'enterprise', 'name' => 'Enterprise', 'description' => 'Tudo do Profissional, com BI educacional, IA e limites personalizados.', 'price_monthly' => 0, 'trial_days' => 30, 'order' => 3, 'features' => $enterprise,
                'limits' => array_fill_keys(['students', 'users', 'teachers', 'classes', 'courses', 'questions', 'exams', 'ai_question_generations', 'document_processing'], null)],
        ];

        foreach ($plans as $plan) {
            SaasPlan::withTrashed()->firstOrCreate(['slug' => $plan['slug']], $plan + ['status' => 'active']);
        }
    }
}
