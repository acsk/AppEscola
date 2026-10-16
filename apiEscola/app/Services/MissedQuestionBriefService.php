<?php

namespace App\Services;

use App\Models\ExamQuestion;
use App\Support\QuestionRichText;
use Illuminate\Support\Facades\DB;

/**
 * Questões que os alunos mais erram (prática e simulados) e um resumo para gerar questões novas.
 * Só entram questões do banco: avulsas ou de simulado arquivado. A contagem segue a da listagem:
 * respostas depois da última aprovação e depois de um reset de erros.
 */
class MissedQuestionBriefService
{
    public const DEFAULT_LIMIT = 12;

    public const DEFAULT_MIN_ANSWERS = 3;

    /**
     * @param  array{id: int, name: string, enrollment_number: string|null}|null  $student
     * @return array{
     *   scope: string,
     *   student: array{id: int, name: string, enrollment_number: string|null}|null,
     *   min_answers: int|null,
     *   questions: array<int, array<string, mixed>>,
     *   summary: string
     * }
     */
    public function build(int $tenantId, string $scope, ?array $student, int $limit, int $minAnswers): array
    {
        $limit = max(1, min(30, $limit));
        $minAnswers = max(1, min(100, $minAnswers));
        $collective = $scope !== 'student';
        $ranked = $this->ranked($tenantId, $collective ? null : (int) $student['id'], $limit, $collective ? $minAnswers : 1);

        $questions = $ranked === [] ? [] : $this->hydrate($tenantId, $ranked);
        $presented = self::present(
            $questions,
            $collective ? 'collective' : 'student',
            $collective ? null : ($student['name'] ?? null),
            $collective ? $minAnswers : null
        );

        return [
            'scope' => $collective ? 'collective' : 'student',
            'student' => $collective ? null : $student,
            'min_answers' => $collective ? $minAnswers : null,
            'questions' => $presented['questions'],
            'summary' => $presented['summary'],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $questions
     * @return array{questions: array<int, array<string, mixed>>, summary: string}
     */
    public static function present(array $questions, string $scope, ?string $studentName, ?int $minAnswers): array
    {
        $withNotes = array_map(fn (array $question) => $question + [
            'generation_note' => self::note($question),
        ], $questions);

        return [
            'questions' => $withNotes,
            'summary' => self::summary($withNotes, $scope, $studentName, $minAnswers),
        ];
    }

    /**
     * @return array<int, array{question_id: int, wrong_count: int, answer_count: int, students_wrong: int}>
     */
    private function ranked(int $tenantId, ?int $studentId, int $limit, int $minAnswers): array
    {
        $ranked = DB::query()
            ->fromSub($this->answers($tenantId, $studentId), 'answers')
            ->groupBy('question_id')
            ->havingRaw('SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) > 0')
            ->havingRaw('COUNT(*) >= ?', [$minAnswers])
            ->orderByRaw('SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) / COUNT(*) DESC')
            ->orderByRaw('SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) DESC')
            ->limit($limit)
            ->selectRaw(
                'question_id, '
                .'SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as wrong_count, '
                .'COUNT(*) as answer_count, '
                .'COUNT(DISTINCT CASE WHEN is_correct = 0 THEN student_id END) as students_wrong'
            )
            ->get();

        return $ranked->map(fn ($row) => [
            'question_id' => (int) $row->question_id,
            'wrong_count' => (int) $row->wrong_count,
            'answer_count' => (int) $row->answer_count,
            'students_wrong' => (int) $row->students_wrong,
        ])->all();
    }

    private function answers(int $tenantId, ?int $studentId)
    {
        $practice = DB::table('practice_answers as pa')
            ->join('exam_questions as eq', 'eq.id', '=', 'pa.exam_question_id')
            ->where('pa.tenant_id', $tenantId)
            ->where('eq.tenant_id', $tenantId)
            ->whereNull('eq.deleted_at')
            ->where('eq.is_annulled', false)
            ->when($studentId !== null, fn ($query) => $query->where('pa.student_id', $studentId))
            ->where(function ($answers) {
                $answers->whereNull('eq.errors_reset_at')
                    ->orWhereColumn('pa.answered_at', '>', 'eq.errors_reset_at');
            });
        $this->onlyInBank($practice, 'eq');
        ExamQuestion::whereLatestReviewApproved($practice, 'pa.exam_question_id');
        $practice->selectRaw('pa.exam_question_id as question_id, pa.student_id as student_id, pa.is_correct as is_correct');

        $official = DB::table('exam_answers as ea')
            ->join('exam_attempts as att', 'att.id', '=', 'ea.attempt_id')
            ->join('exam_questions as eq', 'eq.id', '=', 'ea.question_id')
            ->where('att.tenant_id', $tenantId)
            ->where('eq.tenant_id', $tenantId)
            ->whereNull('att.deleted_at')
            ->whereNull('eq.deleted_at')
            ->where('eq.is_annulled', false)
            ->whereNotNull('ea.is_correct')
            ->when($studentId !== null, fn ($query) => $query->where('att.student_id', $studentId))
            ->where(function ($answers) {
                $answers->whereNull('eq.errors_reset_at')
                    ->orWhereColumn('ea.created_at', '>', 'eq.errors_reset_at');
            });
        $this->onlyInBank($official, 'eq');
        ExamQuestion::whereLatestReviewApproved($official, 'ea.question_id');
        $official->selectRaw('ea.question_id as question_id, att.student_id as student_id, ea.is_correct as is_correct');

        return $practice->unionAll($official);
    }

    private function onlyInBank(object $query, string $alias): void
    {
        $query->where(function ($bank) use ($alias) {
            $bank->whereNull($alias.'.exam_id')
                ->orWhereExists(function ($exam) use ($alias) {
                    $exam->selectRaw('1')
                        ->from('exams')
                        ->join('exam_statuses', 'exam_statuses.id', '=', 'exams.exam_status_id')
                        ->whereColumn('exams.id', $alias.'.exam_id')
                        ->where('exam_statuses.slug', 'archived')
                        ->whereNull('exams.deleted_at');
                });
        });
    }

    /**
     * @param  array<int, array{question_id: int, wrong_count: int, answer_count: int, students_wrong: int}>  $ranked
     * @return array<int, array<string, mixed>>
     */
    private function hydrate(int $tenantId, array $ranked): array
    {
        $ids = array_column($ranked, 'question_id');
        $models = ExamQuestion::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $ids)
            ->with(['subject:id,name', 'topics:id,name', 'difficulty:id,name'])
            ->withCount('options')
            ->get()
            ->keyBy('id');

        $rows = [];
        foreach ($ranked as $stat) {
            $question = $models->get($stat['question_id']);
            if ($question === null) {
                continue;
            }
            $plain = trim(preg_replace('/\s+/u', ' ', QuestionRichText::plain($question->question_text)) ?? '');
            $snippet = $plain !== ''
                ? mb_substr($plain, 0, 160).(mb_strlen($plain) > 160 ? '…' : '')
                : ($question->image_url ? 'Enunciado em imagem' : 'Sem enunciado');
            $total = $stat['answer_count'];
            $rows[] = [
                'id' => (int) $question->id,
                'type' => $question->type === 'essay' ? 'essay' : 'multiple_choice',
                'options_count' => (int) $question->options_count,
                'difficulty_id' => $question->difficulty_id !== null ? (int) $question->difficulty_id : null,
                'difficulty' => $question->difficulty?->name,
                'subject' => $question->subject?->name,
                'topics' => $question->topics->pluck('name')->map(fn ($name) => (string) $name)->values()->all(),
                'snippet' => $snippet,
                'image_url' => $question->image_url,
                'wrong_count' => $stat['wrong_count'],
                'answer_count' => $total,
                'error_rate' => $total > 0 ? round($stat['wrong_count'] / $total * 100, 1) : null,
                'students_wrong' => $stat['students_wrong'],
            ];
        }

        return $rows;
    }

    /**
     * @param  array<int, array<string, mixed>>  $questions
     */
    private static function summary(array $questions, string $scope, ?string $studentName, ?int $minAnswers): string
    {
        $who = $scope === 'student'
            ? 'Aluno '.($studentName !== null && $studentName !== '' ? $studentName : 'selecionado')
            : 'Conjunto da escola';
        $floor = $minAnswers !== null
            ? " Pelo menos {$minAnswers} respostas em cada questão."
            : '';

        if ($questions === []) {
            $empty = $scope === 'student'
                ? 'Este aluno ainda não tem erro contabilizado em questões do banco.'
                : 'Ainda não há questões do banco com respostas suficientes e algum erro.';

            return "Resumo para gerar novas questões\n{$who}.{$floor}\n\n{$empty}";
        }

        $lines = [
            'Resumo para gerar novas questões',
            "{$who}. ".count($questions).' '.self::plural(count($questions), 'questão', 'questões')." com mais erros.{$floor}",
            'Prática e simulados, depois da última aprovação. Avulsas e de simulados arquivados.',
            '',
        ];

        $groups = [];
        foreach ($questions as $question) {
            $subject = $question['subject'] ?: 'Sem disciplina';
            $topics = $question['topics'] !== [] ? implode(', ', $question['topics']) : 'Sem assunto';
            $key = $subject.'|'.$topics;
            $groups[$key]['title'] = $subject.' — '.$topics;
            $groups[$key]['items'][] = $question;
        }

        foreach ($groups as $group) {
            $items = $group['items'];
            $rates = array_values(array_unique(array_filter(array_column($items, 'error_rate'), fn ($rate) => $rate !== null)));
            $rateText = $rates === []
                ? ''
                : (count($rates) === 1
                    ? ' Taxa de erro de '.self::percent((float) $rates[0]).'.'
                    : ' Taxa de erro de '.self::percent((float) min($rates)).' a '.self::percent((float) max($rates)).'.');
            $lines[] = $group['title'];
            $lines[] = count($items).' '.self::plural(count($items), 'questão', 'questões').'.'.$rateText;
            foreach ($items as $item) {
                $lines[] = '#'.$item['id'].' · '.self::counts($item).' · '.$item['snippet'];
            }
            $lines[] = 'Gerar outra situação da mesma habilidade, com outros dados e outras alternativas.';
            $lines[] = '';
        }

        return rtrim(implode("\n", $lines));
    }

    /** @param  array<string, mixed>  $question */
    private static function note(array $question): string
    {
        $where = $question['subject'] ?: 'esta habilidade';
        if ($question['topics'] !== []) {
            $where .= ' ('.implode(', ', $question['topics']).')';
        }
        $text = "Habilidade com mais erros em {$where}: ".self::counts($question)
            .'. Crie outra situação, com outros dados e outras alternativas.';

        return mb_strlen($text) > 500 ? mb_substr($text, 0, 497).'…' : $text;
    }

    /** @param  array<string, mixed>  $question */
    private static function counts(array $question): string
    {
        $wrong = (int) $question['wrong_count'];
        $total = (int) $question['answer_count'];
        $text = $wrong.' '.self::plural($wrong, 'erro', 'erros')." em {$total} ".self::plural($total, 'resposta', 'respostas');
        if ($question['error_rate'] !== null) {
            $text .= ' ('.self::percent((float) $question['error_rate']).')';
        }
        $students = (int) ($question['students_wrong'] ?? 0);
        if ($students > 1) {
            $text .= " · {$students} alunos";
        }

        return $text;
    }

    private static function percent(float $rate): string
    {
        $rounded = round($rate, 1);
        $text = abs($rounded - round($rounded)) < 0.05
            ? (string) (int) round($rounded)
            : number_format($rounded, 1, ',', '');

        return $text.'%';
    }

    private static function plural(int $count, string $one, string $many): string
    {
        return $count === 1 ? $one : $many;
    }
}
