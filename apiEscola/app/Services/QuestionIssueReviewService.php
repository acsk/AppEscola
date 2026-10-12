<?php

namespace App\Services;

use App\Models\ExamQuestion;

/**
 * Encerra a revisão pedida pelos alunos.
 * Tira o aviso, marca a questão como revalidada e zera a contagem de erros do painel.
 * As respostas oficiais do simulado permanecem.
 */
class QuestionIssueReviewService
{
    public function resolve(ExamQuestion $question): bool
    {
        if (! $question->issueReports()->exists()) {
            return false;
        }

        $question->issueReports()->delete();
        $question->forceFill([
            'revalidated_at' => now(),
            'errors_reset_at' => now(),
        ])->save();

        return true;
    }
}
