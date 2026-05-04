<?php

namespace Database\Seeders;

use App\Models\Exam;
use App\Models\ExamAttempt;
use App\Models\ExamAnswer;
use App\Models\ExamQuestion;
use App\Models\ExamQuestionOption;
use App\Models\ExamStatus;
use App\Models\ExamType;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ExamSeeder extends Seeder
{
    public function run(): void
    {
        $tenant  = Tenant::first();
        $admin   = User::where('tenant_id', $tenant->id)->first();
        $math    = Subject::where('tenant_id', $tenant->id)->where('name', 'Matemática')->first();
        $port    = Subject::where('tenant_id', $tenant->id)->where('name', 'Português')->first();
        $students = Student::where('tenant_id', $tenant->id)->take(5)->get();

        $statusPublished = ExamStatus::where('slug', 'published')->value('id');
        $typeEnem        = ExamType::where('slug', 'enem')->value('id');

        /** ----------------------------------------------------------------
         * Simulado: ENEM – Matemática e Linguagens (10 questões)
         * ---------------------------------------------------------------- */
        $exam = Exam::create([
            'tenant_id'       => $tenant->id,
            'exam_status_id'  => $statusPublished,
            'exam_type_id'    => $typeEnem,
            'title'           => 'Simulado ENEM 2026 – Matemática e Linguagens',
            'description'     => 'Simulado preparatório com 8 questões objetivas de Matemática e 2 discursivas de Português.',
            'duration_minutes'=> 90,
            'passing_score'   => 60.00,
            'created_by'      => $admin->id,
            'updated_by'      => $admin->id,
        ]);

        // ── Questões de Matemática ──────────────────────────────────────
        $questions = [];

        $questions[] = $this->objective($exam->id, $tenant->id, $math->id, 1,
            'Uma empresa aumentou seu faturamento em 20% no primeiro semestre e reduziu 10% no segundo. Qual foi a variação percentual total no ano?',
            [
                ['Aumento de 10%',   false],
                ['Aumento de 8%',    true],   // 1,2 × 0,9 = 1,08 → +8%
                ['Aumento de 5%',    false],
                ['Redução de 2%',    false],
                ['Aumento de 10,8%', false],
            ],
            'O fator resultante é 1,2 × 0,9 = 1,08, portanto aumento de 8%.',
            1.0, $admin->id
        );

        $questions[] = $this->objective($exam->id, $tenant->id, $math->id, 2,
            'Qual é o valor de x na equação 2x² – 8x = 0?',
            [
                ['x = 0 apenas',           false],
                ['x = 4 apenas',           false],
                ['x = 0 ou x = 4',         true],
                ['x = –2 ou x = 2',        false],
                ['Não possui solução real', false],
            ],
            '2x(x – 4) = 0 → x = 0 ou x = 4.',
            1.0, $admin->id
        );

        $questions[] = $this->objective($exam->id, $tenant->id, $math->id, 3,
            'Um triângulo retângulo tem catetos medindo 6 cm e 8 cm. Qual é o comprimento da hipotenusa?',
            [
                ['12 cm', false],
                ['10 cm', true],   // √(36 + 64) = √100 = 10
                ['14 cm', false],
                ['11 cm', false],
                ['9 cm',  false],
            ],
            'Pelo teorema de Pitágoras: √(6² + 8²) = √100 = 10 cm.',
            1.0, $admin->id
        );

        $questions[] = $this->objective($exam->id, $tenant->id, $math->id, 4,
            'Uma torneira enche um tanque em 4 horas e outra em 6 horas. Trabalhando juntas, em quanto tempo enchem o tanque?',
            [
                ['2 horas e 24 minutos',   true],   // 1/(1/4+1/6) = 12/5 = 2,4h = 2h24min
                ['3 horas',                false],
                ['5 horas',                false],
                ['1 hora e 30 minutos',    false],
                ['2 horas e 12 minutos',   false],
            ],
            'Taxa combinada = 1/4 + 1/6 = 5/12 por hora → tempo = 12/5 = 2,4 h = 2 h 24 min.',
            1.0, $admin->id
        );

        $questions[] = $this->objective($exam->id, $tenant->id, $math->id, 5,
            'Quantos termos tem a progressão aritmética 3, 7, 11, …, 99?',
            [
                ['22', false],
                ['25', true],   // a_n = 3 + (n-1)×4 = 99 → n = 25
                ['24', false],
                ['26', false],
                ['20', false],
            ],
            'a_n = 3 + (n–1)·4 = 99 → (n–1) = 24 → n = 25.',
            1.0, $admin->id
        );

        $questions[] = $this->objective($exam->id, $tenant->id, $math->id, 6,
            'Se log₂8 = x, qual é o valor de x?',
            [
                ['2',   false],
                ['3',   true],   // 2³ = 8
                ['4',   false],
                ['1,5', false],
                ['6',   false],
            ],
            '2ˣ = 8 = 2³ → x = 3.',
            1.0, $admin->id
        );

        $questions[] = $this->objective($exam->id, $tenant->id, $math->id, 7,
            'Um capital de R$ 2.000,00 é aplicado a uma taxa de juros simples de 3% ao mês durante 5 meses. Qual o montante final?',
            [
                ['R$ 2.300,00', true],   // M = 2000 × (1 + 0,03×5) = 2300
                ['R$ 2.315,25', false],
                ['R$ 2.060,00', false],
                ['R$ 2.200,00', false],
                ['R$ 2.150,00', false],
            ],
            'M = C(1 + it) = 2000 × (1 + 0,03 × 5) = 2000 × 1,15 = R$ 2.300,00.',
            1.0, $admin->id
        );

        $questions[] = $this->objective($exam->id, $tenant->id, $math->id, 8,
            'Qual é a área de um círculo com raio 7 cm? (Use π ≈ 3,14)',
            [
                ['153,86 cm²', true],   // 3,14 × 49 = 153,86
                ['43,96 cm²',  false],
                ['49 cm²',     false],
                ['219,80 cm²', false],
                ['98 cm²',     false],
            ],
            'A = π × r² = 3,14 × 7² = 3,14 × 49 = 153,86 cm².',
            1.0, $admin->id
        );

        // ── Questões de Português (discursivas) ────────────────────────
        $questions[] = $this->essay($exam->id, $tenant->id, $port->id, 9,
            'Leia o trecho a seguir e identifique e explique a figura de linguagem presente: "A vida é uma caixinha de surpresas."',
            'A figura presente é a metáfora: comparação implícita entre "vida" e "caixinha de surpresas", sem uso de conectivo comparativo.',
            1.0, $admin->id
        );

        $questions[] = $this->essay($exam->id, $tenant->id, $port->id, 10,
            'Em 5 linhas, disserte sobre a importância da leitura para o desenvolvimento crítico do cidadão.',
            null,
            1.0, $admin->id
        );

        // ── Tentativas simuladas para 3 alunos ─────────────────────────
        foreach ($students->take(3) as $studentIndex => $student) {
            $attempt = ExamAttempt::create([
                'tenant_id'  => $tenant->id,
                'exam_id'    => $exam->id,
                'student_id' => $student->id,
                'max_score'  => 10.0,
                'status'     => 'completed',
                'started_at' => now()->subHours(rand(2, 48)),
            ]);

            $totalScore = 0;

            foreach ($questions as $question) {
                if ($question->type === 'multiple_choice') {
                    // Simula 70–100% de acerto para o 1º aluno, 40–60% para os demais
                    $hitChance = $studentIndex === 0 ? 85 : ($studentIndex === 1 ? 60 : 40);
                    $hit = rand(1, 100) <= $hitChance;

                    $correctOption = $question->options()->where('is_correct', true)->first();
                    $wrongOptions  = $question->options()->where('is_correct', false)->get();
                    $chosenOption  = $hit ? $correctOption : $wrongOptions->random();

                    ExamAnswer::create([
                        'attempt_id'   => $attempt->id,
                        'question_id'  => $question->id,
                        'option_id'    => $chosenOption->id,
                        'is_correct'   => $hit,
                        'points_earned'=> $hit ? (float) $question->points : 0,
                    ]);

                    if ($hit) {
                        $totalScore += (float) $question->points;
                    }
                } else {
                    // Discursiva: aguarda correção manual
                    ExamAnswer::create([
                        'attempt_id'   => $attempt->id,
                        'question_id'  => $question->id,
                        'option_id'    => null,
                        'text_answer'  => 'Resposta simulada do aluno ' . ($studentIndex + 1) . '.',
                        'is_correct'   => null,
                        'points_earned'=> 0,
                    ]);
                }
            }

            $percentage = round(($totalScore / 10) * 100, 2);
            $attempt->update([
                'status'      => 'completed',
                'finished_at' => now()->subHours(rand(0, 2)),
                'score'       => $totalScore,
                'percentage'  => $percentage,
            ]);
        }

        $this->command->info("Simulado '{$exam->title}' criado com " . count($questions) . " questões e 3 tentativas simuladas.");
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function objective(
        int $examId, int $tenantId, int $subjectId, int $order,
        string $questionText, array $options, string $explanation,
        float $points, int $userId
    ): ExamQuestion {
        $question = ExamQuestion::create([
            'tenant_id'     => $tenantId,
            'exam_id'       => $examId,
            'subject_id'    => $subjectId,
            'type'          => 'multiple_choice',
            'question_text' => $questionText,
            'points'        => $points,
            'order'         => $order,
            'explanation'   => $explanation,
            'created_by'    => $userId,
            'updated_by'    => $userId,
        ]);

        foreach ($options as $i => [$text, $isCorrect]) {
            ExamQuestionOption::create([
                'question_id' => $question->id,
                'option_text' => $text,
                'is_correct'  => $isCorrect,
                'order'       => $i + 1,
            ]);
        }

        return $question->load('options');
    }

    private function essay(
        int $examId, int $tenantId, int $subjectId, int $order,
        string $questionText, ?string $explanation,
        float $points, int $userId
    ): ExamQuestion {
        return ExamQuestion::create([
            'tenant_id'     => $tenantId,
            'exam_id'       => $examId,
            'subject_id'    => $subjectId,
            'type'          => 'essay',
            'question_text' => $questionText,
            'points'        => $points,
            'order'         => $order,
            'explanation'   => $explanation,
            'created_by'    => $userId,
            'updated_by'    => $userId,
        ]);
    }
}
