<?php

namespace Database\Seeders;

use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\ExamQuestionOption;
use App\Models\ExamStatus;
use App\Models\ExamType;
use App\Models\Subject;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;

class SimuladoSeeder extends Seeder
{
    public function run(): void
    {
        $tenant   = Tenant::first();
        $admin    = User::where('tenant_id', $tenant->id)->first();

        $published  = ExamStatus::where('slug', 'published')->value('id');
        $vestibular = ExamType::where('slug', 'vestibular-tradicional')->value('id');

        $math = Subject::where('tenant_id', $tenant->id)->where('name', 'Matemática')->first();
        $port = Subject::where('tenant_id', $tenant->id)->where('name', 'Português')->first();
        $fis  = Subject::where('tenant_id', $tenant->id)->where('name', 'Física')->first();

        // ── Simulado 1 – Matemática Básica ────────────────────────────────
        $this->criarSimulado(
            statusId: $published,
            typeId: $vestibular,
            title: 'Simulado – Matemática Básica',
            description: '3 questões objetivas cobrindo aritmética, álgebra e geometria.',
            duration: 30,
            passing: 60.00,
            questions: [
                $this->questaoObj(
                    subjectId: $math->id,
                    order: 1,
                    text: 'Qual é o resultado de 15% de 240?',
                    options: [
                        ['32', false],
                        ['36', true],   // 240 × 0,15 = 36
                        ['38', false],
                        ['40', false],
                        ['30', false],
                    ],
                    explanation: '240 × 0,15 = 36.'
                ),
                $this->questaoObj(
                    subjectId: $math->id,
                    order: 2,
                    text: 'Resolva: 3x + 9 = 0. Qual é o valor de x?',
                    options: [
                        ['x = 3',  false],
                        ['x = –3', true],   // 3x = –9 → x = –3
                        ['x = 9',  false],
                        ['x = –9', false],
                        ['x = 0',  false],
                    ],
                    explanation: '3x = –9 → x = –3.'
                ),
                $this->questaoObj(
                    subjectId: $math->id,
                    order: 3,
                    text: 'Qual é a área de um quadrado cujo lado mede 9 cm?',
                    options: [
                        ['36 cm²', false],
                        ['72 cm²', false],
                        ['81 cm²', true],   // 9² = 81
                        ['18 cm²', false],
                        ['45 cm²', false],
                    ],
                    explanation: 'A = l² = 9² = 81 cm².'
                ),
            ],
            tenantId: $tenant->id,
            adminId: $admin->id
        );

        // ── Simulado 2 – Português: Gramática e Interpretação ─────────────
        $this->criarSimulado(
            statusId: $published,
            typeId: $vestibular,
            title: 'Simulado – Português: Gramática e Interpretação',
            description: '2 questões objetivas e 1 discursiva sobre gramática e leitura.',
            duration: 30,
            passing: 60.00,
            questions: [
                $this->questaoObj(
                    subjectId: $port->id,
                    order: 1,
                    text: 'Assinale a alternativa em que todas as palavras estão grafadas corretamente:',
                    options: [
                        ['exceção, farmácia, paralisia', true],
                        ['excessão, farmácia, paralisia', false],
                        ['exceção, farmasia, paralisia', false],
                        ['exceção, farmácia, paralissia', false],
                        ['exessão, farmácia, paralisia', false],
                    ],
                    explanation: 'As três palavras têm grafia correta: exceção, farmácia, paralisia.'
                ),
                $this->questaoObj(
                    subjectId: $port->id,
                    order: 2,
                    text: 'Qual é o sujeito da oração: "Chegaram as encomendas ontem"?',
                    options: [
                        ['Chegaram',            false],
                        ['As encomendas',        true],
                        ['Ontem',               false],
                        ['Chegaram as encomendas', false],
                        ['Oração sem sujeito',   false],
                    ],
                    explanation: '"As encomendas" é o sujeito posposto ao verbo.'
                ),
                $this->questaoEssay(
                    subjectId: $port->id,
                    order: 3,
                    text: 'Em até 5 linhas, explique a diferença entre conotação e denotação, dando um exemplo de cada.',
                    explanation: 'Denotação: sentido literal (ex.: "pedra = rocha"). Conotação: sentido figurado (ex.: "ele tem um coração de pedra").'
                ),
            ],
            tenantId: $tenant->id,
            adminId: $admin->id
        );

        // ── Simulado 3 – Física: Mecânica ─────────────────────────────────
        $this->criarSimulado(
            statusId: $published,
            typeId: $vestibular,
            title: 'Simulado – Física: Mecânica',
            description: '3 questões objetivas sobre cinemática e dinâmica.',
            duration: 30,
            passing: 60.00,
            questions: [
                $this->questaoObj(
                    subjectId: $fis->id,
                    order: 1,
                    text: 'Um carro parte do repouso com aceleração constante de 4 m/s². Qual é a velocidade após 5 s?',
                    options: [
                        ['10 m/s', false],
                        ['20 m/s', true],   // v = a × t = 4 × 5 = 20
                        ['25 m/s', false],
                        ['16 m/s', false],
                        ['40 m/s', false],
                    ],
                    explanation: 'v = v₀ + at = 0 + 4 × 5 = 20 m/s.'
                ),
                $this->questaoObj(
                    subjectId: $fis->id,
                    order: 2,
                    text: 'Uma força de 30 N é aplicada a um corpo de 6 kg. Qual é a aceleração produzida? (Desconsidere o atrito.)',
                    options: [
                        ['3 m/s²', false],
                        ['4 m/s²', false],
                        ['5 m/s²', true],   // a = F/m = 30/6 = 5
                        ['6 m/s²', false],
                        ['180 m/s²', false],
                    ],
                    explanation: 'Segunda Lei de Newton: a = F/m = 30/6 = 5 m/s².'
                ),
                $this->questaoObj(
                    subjectId: $fis->id,
                    order: 3,
                    text: 'Um objeto de 2 kg está a 10 m de altura. Qual é sua energia potencial gravitacional? (g = 10 m/s²)',
                    options: [
                        ['20 J',  false],
                        ['100 J', false],
                        ['200 J', true],   // Ep = mgh = 2 × 10 × 10 = 200
                        ['400 J', false],
                        ['50 J',  false],
                    ],
                    explanation: 'Ep = mgh = 2 × 10 × 10 = 200 J.'
                ),
            ],
            tenantId: $tenant->id,
            adminId: $admin->id
        );
    }

    // ── Cria simulado + questões (sem tentativas) ─────────────────────────

    /**
     * @param array<int, array{subject_id: int, order: int, type: string, text: string, options?: array, explanation: ?string}> $questions
     */
    private function criarSimulado(
        int $statusId,
        int $typeId,
        string $title,
        string $description,
        int $duration,
        float $passing,
        array $questions,
        int $tenantId,
        int $adminId,
    ): void {
        $exam = Exam::create([
            'tenant_id'        => $tenantId,
            'exam_status_id'   => $statusId,
            'exam_type_id'     => $typeId,
            'title'            => $title,
            'description'      => $description,
            'duration_minutes' => $duration,
            'passing_score'    => $passing,
            'starts_at'        => now()->subHour(),
            'ends_at'          => now()->addDays(10),
            'release_results_after_end' => false,
            'created_by'       => $adminId,
            'updated_by'       => $adminId,
        ]);

        // Cria as questões vinculadas ao exam
        $createdQuestions = [];
        foreach ($questions as $q) {
            $question = ExamQuestion::create([
                'tenant_id'       => $tenantId,
                'exam_id'         => $exam->id,
                'subject_id'      => $q['subject_id'],
                'type'            => $q['type'],
                'question_text'   => $q['text'],
                'points'          => 1.0,
                'order'           => $q['order'],
                'explanation'     => $q['explanation'],
                'created_by'      => $adminId,
                'updated_by'      => $adminId,
            ]);

            if ($q['type'] === 'multiple_choice') {
                foreach ($q['options'] as $i => [$optText, $isCorrect]) {
                    ExamQuestionOption::create([
                        'question_id' => $question->id,
                        'option_text' => $optText,
                        'is_correct'  => $isCorrect,
                        'order'       => $i + 1,
                    ]);
                }
            }

            $createdQuestions[] = $question;
        }

        $this->command->info("✓ '{$title}' criado com " . count($createdQuestions) . " questões, aberto para respostas dos usuários.");
    }

    // ── Helpers de definição de questão ──────────────────────────────────

    private function questaoObj(int $subjectId, int $order, string $text, array $options, string $explanation): array
    {
        return [
            'subject_id'  => $subjectId,
            'order'       => $order,
            'type'        => 'multiple_choice',
            'text'        => $text,
            'options'     => $options,
            'explanation' => $explanation,
        ];
    }

    private function questaoEssay(int $subjectId, int $order, string $text, ?string $explanation = null): array
    {
        return [
            'subject_id'  => $subjectId,
            'order'       => $order,
            'type'        => 'essay',
            'text'        => $text,
            'options'     => [],
            'explanation' => $explanation,
        ];
    }
}
