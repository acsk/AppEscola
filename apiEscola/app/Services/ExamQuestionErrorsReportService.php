<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamAnswer;
use Illuminate\Support\Collection;

class ExamQuestionErrorsReportService
{
    public function __construct(
        private readonly ExamAttemptIntegrityService $integrity,
    ) {
    }

    /**
     * Relatório de questões com mais erros, baseado na melhor tentativa
     * concluída de cada aluno (mesmo critério do ranking).
     *
     * @return array{
     *   exam: array<string, mixed>,
     *   summary: array<string, mixed>,
     *   questions: array<int, array<string, mixed>>
     * }
     */
    public function build(Exam $exam, ?int $tenantId = null): array
    {
        $exam->loadMissing(['courses', 'course', 'subject', 'examStatus', 'examType', 'questions.subject']);

        $bestAttempts = $this->integrity->bestCompletedAttemptsForExam($exam->id, $tenantId);
        $attemptIds = $bestAttempts->pluck('id')->map(fn ($id) => (int) $id)->all();

        $countsByQuestion = $this->gradedCountsByQuestion($attemptIds);

        $questions = $exam->questions
            ->sortBy('order')
            ->values()
            ->map(function ($question) use ($countsByQuestion) {
                $counts = $countsByQuestion->get((int) $question->id, [
                    'correct_count' => 0,
                    'wrong_count' => 0,
                    'total_answers' => 0,
                ]);

                $total = (int) $counts['total_answers'];
                $correct = (int) $counts['correct_count'];
                $wrong = (int) $counts['wrong_count'];
                $hitRate = $total > 0 ? round(($correct / $total) * 100, 1) : null;
                $errorRate = $total > 0 ? round(($wrong / $total) * 100, 1) : null;

                $text = (string) ($question->question_text ?? '');
                $preview = $text !== ''
                    ? mb_substr($text, 0, 120).(mb_strlen($text) > 120 ? '…' : '')
                    : ($question->image_url ? '[Enunciado em imagem]' : '[Sem enunciado]');

                return [
                    'question_id' => (int) $question->id,
                    'order' => (int) $question->order,
                    'type' => $question->type,
                    'question_text' => $text !== '' ? $text : null,
                    'question_text_preview' => $preview,
                    'image_url' => $question->image_url,
                    'subject' => $question->subject?->name,
                    'points' => $question->points !== null ? (float) $question->points : null,
                    'correct_count' => $correct,
                    'wrong_count' => $wrong,
                    'total_answers' => $total,
                    'hit_rate' => $hitRate,
                    'error_rate' => $errorRate,
                ];
            })
            ->sort(fn (array $a, array $b) => self::compareQuestionErrorRows($a, $b))
            ->values()
            ->all();

        $withAnswers = collect($questions)->filter(fn (array $q) => $q['total_answers'] > 0);
        $withErrors = $withAnswers->filter(fn (array $q) => $q['wrong_count'] > 0);

        $courseNames = $exam->courses?->pluck('name')->filter()->values()->all() ?? [];
        if ($courseNames === [] && $exam->course) {
            $courseNames = [$exam->course->name];
        }

        return [
            'exam' => [
                'id' => $exam->id,
                'title' => $exam->title,
                'exam_type' => $exam->examType?->slug,
                'exam_type_label' => $exam->examType?->label,
                'status' => $exam->examStatus?->slug,
                'status_label' => $exam->examStatus?->label,
                'courses' => $courseNames,
                'subject' => $exam->subject
                    ? ['id' => $exam->subject->id, 'name' => $exam->subject->name]
                    : null,
            ],
            'summary' => [
                'attempt_scope' => 'best_completed_per_student',
                'graded_students_count' => $bestAttempts->count(),
                'total_questions' => count($questions),
                'questions_with_answers' => $withAnswers->count(),
                'questions_with_errors' => $withErrors->count(),
                'avg_error_rate' => $withAnswers->isNotEmpty()
                    ? round((float) $withAnswers->avg('error_rate'), 1)
                    : null,
                'avg_hit_rate' => $withAnswers->isNotEmpty()
                    ? round((float) $withAnswers->avg('hit_rate'), 1)
                    : null,
            ],
            'questions' => $questions,
        ];
    }

    /**
     * Ordena por taxa de erro (maior primeiro); sem respostas corretas/erradas ficam no fim.
     *
     * @param  array{error_rate: float|null, wrong_count: int, order: int}  $a
     * @param  array{error_rate: float|null, wrong_count: int, order: int}  $b
     */
    public static function compareQuestionErrorRows(array $a, array $b): int
    {
        $aRate = $a['error_rate'];
        $bRate = $b['error_rate'];

        if ($aRate === null && $bRate === null) {
            return $a['order'] <=> $b['order'];
        }
        if ($aRate === null) {
            return 1;
        }
        if ($bRate === null) {
            return -1;
        }
        if ($bRate !== $aRate) {
            return $bRate <=> $aRate;
        }
        if ($b['wrong_count'] !== $a['wrong_count']) {
            return $b['wrong_count'] <=> $a['wrong_count'];
        }

        return $a['order'] <=> $b['order'];
    }

    /**
     * @param  array<int, int>  $attemptIds
     * @return Collection<int, array{correct_count: int, wrong_count: int, total_answers: int}>
     */
    private function gradedCountsByQuestion(array $attemptIds): Collection
    {
        if ($attemptIds === []) {
            return collect();
        }

        return ExamAnswer::query()
            ->selectRaw('question_id')
            ->selectRaw('SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_count')
            ->selectRaw('SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as wrong_count')
            ->selectRaw('COUNT(*) as total_answers')
            ->whereIn('attempt_id', $attemptIds)
            ->whereNotNull('is_correct')
            ->groupBy('question_id')
            ->get()
            ->keyBy(fn ($row) => (int) $row->question_id)
            ->map(fn ($row) => [
                'correct_count' => (int) $row->correct_count,
                'wrong_count' => (int) $row->wrong_count,
                'total_answers' => (int) $row->total_answers,
            ]);
    }
}
