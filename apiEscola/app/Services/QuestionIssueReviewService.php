<?php

namespace App\Services;

use App\Models\ExamQuestion;
use App\Models\QuestionReview;

/**
 * Aviso de erro do aluno: a questão sai da validação até o administrador revisar.
 * Ao concluir, a validação volta, o aviso sai e a contagem de erros do painel zera.
 * As respostas de prática e as notas oficiais do simulado permanecem.
 */
class QuestionIssueReviewService
{
    public function suspendForStudentReport(ExamQuestion $question): void
    {
        $latest = QuestionReview::query()->where('question_id', $question->id)->latest('id')->first();
        $approved = in_array($latest?->status, [QuestionReview::APROVADA, QuestionReview::APROVADA_MANUAL], true);

        if ($approved) {
            QuestionReview::withoutEvents(function () use ($question, $latest) {
                QuestionReview::query()->create([
                    'tenant_id' => $question->tenant_id,
                    'question_id' => $question->id,
                    'source_question_id' => $latest?->source_question_id,
                    'content_hash' => $latest?->content_hash ?? hash('sha256', 'student-issue:'.$question->id),
                    'generation_model' => $latest?->generation_model,
                    'gabarito_original' => $latest?->gabarito_original,
                    'gabarito_revisor' => $latest?->gabarito_revisor,
                    'result' => QuestionReview::PENDENTE,
                    'status' => QuestionReview::PENDENTE,
                    'problems' => [[
                        'tipo' => 'aviso_aluno',
                        'gravidade' => 'alta',
                        'descricao' => 'Aluno informou que a questão tem erro e pediu revalidação.',
                    ]],
                    'recommendation' => 'revisar',
                    'explanation' => 'Aluno informou erro. A questão fica sem validação até a revisão do administrador.',
                    'attempts' => 0,
                    'content' => ['source' => 'student_issue'],
                    'validated_at' => now(),
                ]);
            });
        }

        if ($question->revalidated_at !== null) {
            $question->forceFill(['revalidated_at' => null])->save();
        }
    }

    public function resolve(ExamQuestion $question): bool
    {
        if (! $question->issueReports()->exists()) {
            return false;
        }

        $question->issueReports()->delete();
        $this->restoreValidation($question);
        $question->forceFill([
            'revalidated_at' => now(),
            'errors_reset_at' => now(),
        ])->save();

        return true;
    }

    private function restoreValidation(ExamQuestion $question): void
    {
        $latest = QuestionReview::query()->where('question_id', $question->id)->latest('id')->first();
        $source = is_array($latest?->content) ? ($latest->content['source'] ?? null) : null;
        if ($latest === null || $latest->status !== QuestionReview::PENDENTE || $source !== 'student_issue') {
            return;
        }

        QuestionReview::withoutEvents(function () use ($question, $latest) {
            QuestionReview::query()->create([
                'tenant_id' => $question->tenant_id,
                'question_id' => $question->id,
                'source_question_id' => $latest->source_question_id,
                'content_hash' => $latest->content_hash,
                'generation_model' => $latest->generation_model,
                'gabarito_original' => $latest->gabarito_original,
                'gabarito_revisor' => $latest->gabarito_revisor,
                'result' => QuestionReview::APROVADA_MANUAL,
                'status' => QuestionReview::APROVADA_MANUAL,
                'problems' => [],
                'recommendation' => 'aprovada_manual',
                'explanation' => 'Revalidada pelo administrador depois do aviso de erro do aluno.',
                'attempts' => 0,
                'content' => ['source' => 'admin_revalidation'],
                'validated_at' => now(),
            ]);
        });
    }
}
