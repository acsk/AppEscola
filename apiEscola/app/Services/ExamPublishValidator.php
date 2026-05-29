<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamQuestion;
use Illuminate\Validation\Validator;

class ExamPublishValidator
{
    public function validate(Validator $validator, Exam $exam, string $targetStatus): void
    {
        if ($targetStatus !== 'published') {
            return;
        }

        $message = $this->publishedRequirementError($exam);

        if ($message !== null) {
            $validator->errors()->add('status', $message);
        }
    }

    /**
     * Impede publicar ou manter publicado sem ao menos uma questão completa.
     */
    public function publishedRequirementError(Exam $exam): ?string
    {
        $exam->loadMissing(['questions.options']);

        if ($exam->questions->isEmpty()) {
            return 'Não é possível publicar um simulado sem questões.';
        }

        $completeCount = $exam->questions->filter(fn (ExamQuestion $question) => $question->isComplete())->count();

        if ($completeCount === 0) {
            return 'Não é possível publicar um simulado sem ao menos uma questão completa cadastrada.';
        }

        foreach ($exam->questions as $question) {
            if ($question->type !== 'multiple_choice' || $question->isComplete()) {
                continue;
            }

            $filledCount = $question->options
                ->filter(fn ($option) => trim((string) $option->option_text) !== '')
                ->count();

            if ($filledCount >= 2 && $question->options->where('is_correct', true)->count() !== 1) {
                return "A questão #{$question->order} deve ter exatamente uma alternativa correta.";
            }
        }

        return null;
    }

    public function assertCanRemainPublished(Exam $exam, ?int $excludingQuestionId = null): void
    {
        if (! $exam->isPublished()) {
            return;
        }

        $message = $excludingQuestionId === null
            ? $this->publishedRequirementError($exam)
            : $this->publishedRequirementErrorAfterRemoving($exam, $excludingQuestionId);

        if ($message !== null) {
            abort(422, $message);
        }
    }

    private function publishedRequirementErrorAfterRemoving(Exam $exam, int $excludingQuestionId): ?string
    {
        $exam->loadMissing(['questions.options']);

        $remaining = $exam->questions->where('id', '!=', $excludingQuestionId);

        if ($remaining->isEmpty()) {
            return 'Não é possível remover a última questão de um simulado publicado.';
        }

        $completeCount = $remaining->filter(fn (ExamQuestion $question) => $question->isComplete())->count();

        if ($completeCount === 0) {
            return 'Não é possível remover esta questão: o simulado publicado precisa manter ao menos uma questão completa.';
        }

        return null;
    }
}
