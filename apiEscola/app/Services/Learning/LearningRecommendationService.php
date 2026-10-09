<?php

namespace App\Services\Learning;

use App\Models\ExamQuestion;
use App\Models\QuestionDifficulty;
use App\Models\Student;
use App\Models\StudentReviewItem;
use App\Services\PracticePerformanceService;
use App\Services\PracticeService;
use Illuminate\Support\Collection;

/**
 * Escolhe questões que já existem. A IA só é pedida, em lote da escola,
 * quando o assunto prioritário não tem inédita nem revisão vencida.
 */
class LearningRecommendationService
{
    public function __construct(
        private readonly LearningDiagnosisService $diagnosis,
        private readonly PracticeService $practice,
        private readonly LearningGenerationService $generation,
    ) {}

    /** @return list<array<string, mixed>> */
    public function recommend(Student $student, int $limit = 4): array
    {
        $quantity = (int) config('learning.reinforcement_quantity', 10);
        $plans = [];
        foreach ($this->diagnosis->topics($student) as $topic) {
            if (count($plans) >= $limit) {
                break;
            }
            if (! in_array($topic['level'], [
                LearningDiagnosisService::CRITICAL,
                LearningDiagnosisService::ATTENTION,
                LearningDiagnosisService::INSUFFICIENT,
            ], true) || ! $topic['topic_id']) {
                continue;
            }
            $unseen = $this->unseen($student, (int) $topic['topic_id'], $topic['accuracy'], $quantity);
            $reviews = $unseen->count() >= $quantity
                ? collect()
                : $this->dueReviews($student, (int) $topic['topic_id'], $quantity);
            $source = $unseen->isNotEmpty() ? 'unseen' : ($reviews->isNotEmpty() ? 'review' : 'preparing');
            $ids = $unseen->isNotEmpty() ? $unseen->all() : $reviews->all();
            if ($source === 'preparing') {
                $this->generation->enqueue($student->tenant_id, (int) $topic['subject_id'], (int) $topic['topic_id']);
            }
            $plans[] = [
                'subject_id' => $topic['subject_id'],
                'subject_name' => $topic['subject_name'],
                'topic_id' => $topic['topic_id'],
                'topic_name' => $topic['topic_name'],
                'questions' => $topic['questions'],
                'first_correct' => $topic['first_correct'],
                'accuracy' => $topic['accuracy'],
                'level' => $topic['level'],
                'label' => $topic['label'],
                'source' => $source,
                'quantity' => count($ids) > 0 ? count($ids) : $quantity,
                'question_ids' => $ids,
                'message' => $this->message($topic, $source),
                'action' => $source === 'review' ? 'Iniciar revisão' : ($source === 'preparing' ? 'Preparando questões' : 'Praticar '.count($ids).' questões'),
            ];
        }

        return $plans;
    }

    /** @return Collection<int, int> */
    private function unseen(Student $student, int $topicId, ?float $accuracy, int $quantity): Collection
    {
        $target = $this->targetDifficulty($accuracy);

        return $this->practice->practicableFor($student)
            ->whereHas('topics', fn ($q) => $q->where('subject_topics.id', $topicId))
            ->whereNotExists(function ($q) use ($student) {
                $q->selectRaw('1')
                    ->from('practice_answers')
                    ->whereColumn('practice_answers.exam_question_id', 'exam_questions.id')
                    ->where('practice_answers.student_id', $student->id);
            })
            ->with('difficulty:id,sort_order')
            ->limit(80)
            ->get(['exam_questions.id', 'exam_questions.difficulty_id'])
            ->sortBy(fn (ExamQuestion $question) => [
                abs(((int) ($question->difficulty?->sort_order ?? $target)) - $target),
                random_int(0, 1000),
            ])
            ->take($quantity)
            ->pluck('id')
            ->values();
    }

    /** @return Collection<int, int> */
    private function dueReviews(Student $student, int $topicId, int $quantity): Collection
    {
        $today = now(PracticePerformanceService::RANKING_TIMEZONE)->toDateString();

        return StudentReviewItem::query()
            ->where('student_id', $student->id)
            ->whereDate('next_review_on', '<=', $today)
            ->whereHas('question.topics', fn ($q) => $q->where('subject_topics.id', $topicId))
            ->orderBy('next_review_on')
            ->limit($quantity)
            ->pluck('exam_question_id');
    }

    private function targetDifficulty(?float $accuracy): int
    {
        $orders = QuestionDifficulty::query()->orderBy('sort_order')->pluck('sort_order');
        if ($orders->isEmpty()) {
            return 1;
        }
        $index = match (true) {
            $accuracy === null || $accuracy < 50 => 0,
            $accuracy < 85 => (int) floor($orders->count() / 2),
            default => $orders->count() - 1,
        };

        return (int) $orders->values()->get($index);
    }

    /** @param  array<string, mixed>  $topic */
    private function message(array $topic, string $source): string
    {
        if ($source === 'preparing') {
            return 'Não há questões novas deste assunto agora. Um lote está sendo preparado para a escola e entra no plano sem travar esta tela.';
        }
        if ($topic['level'] === LearningDiagnosisService::INSUFFICIENT) {
            return 'Ainda há poucas questões deste assunto. Uma prática inicial já mostra onde focar.';
        }
        if ($topic['level'] === LearningDiagnosisService::ATTENTION) {
            return 'Você está evoluindo, mas ainda precisa reforçar alguns conceitos.';
        }
        if ($source === 'review') {
            return "Você acertou {$topic['first_correct']} de {$topic['questions']} questões. É hora de revisar as que ficaram erradas.";
        }

        return "Você acertou {$topic['first_correct']} de {$topic['questions']} questões. Recomendamos praticar mais este assunto.";
    }
}
