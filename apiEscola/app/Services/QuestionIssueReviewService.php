<?php

namespace App\Services;

use App\Models\ExamQuestion;
use App\Models\QuestionIssueReview;
use App\Models\QuestionReview;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Aviso de erro do aluno: a questão fica sem validação até o administrador analisar.
 * A restrição só sai no salvar, quando ele confirma se havia erro.
 * Havia erro: a contagem de erros do painel zera. Não havia: a contagem permanece.
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

    /**
     * Libera uma questão que não tem aviso de aluno.
     * Com aviso aberto, não altera nada: a restrição espera a confirmação no salvar.
     */
    public function releaseForAnswers(ExamQuestion $question, bool $resetErrors = false): bool
    {
        if ($question->issueReports()->exists()) {
            return false;
        }

        $this->ensureApproved($question);
        $fill = ['revalidated_at' => now()];
        if ($resetErrors) {
            $fill['errors_reset_at'] = now();
        }
        $question->forceFill($fill)->save();

        return $resetErrors;
    }

    /** Encerra o aviso do aluno depois que o administrador confirma se havia erro. */
    public function concludeStudentReport(ExamQuestion $question, bool $hadError, ?User $reviewer = null): void
    {
        if (! $question->issueReports()->exists()) {
            $this->releaseForAnswers($question, false);

            return;
        }

        $reviewerName = trim((string) ($reviewer?->name ?? ''));
        QuestionIssueReview::query()->create([
            'tenant_id' => $question->tenant_id,
            'exam_question_id' => $question->id,
            'reviewed_by' => $reviewer?->id,
            'reviewer_name' => $reviewerName !== '' ? $reviewerName : 'Administrador',
            'had_error' => $hadError,
            'reviewed_at' => now(),
        ]);

        $question->issueReports()->delete();
        $question->unsetRelation('issueReports');
        $this->ensureApproved($question);
        $fill = ['revalidated_at' => now()];
        if ($hadError) {
            $fill['errors_reset_at'] = now();
        }
        $question->forceFill($fill)->save();
    }

    /** Revisada pelo administrador e sem edição de conteúdo depois disso: o aluno não pode avisar erro de novo. */
    public static function isReportLocked(ExamQuestion $question): bool
    {
        $reviewedAt = $question->relationLoaded('issueReviews')
            ? $question->issueReviews->max('reviewed_at')
            : $question->issueReviews()->max('reviewed_at');
        if ($reviewedAt === null) {
            return false;
        }
        $editedAt = $question->content_edited_at;

        return $editedAt === null || $editedAt->lte(Carbon::parse($reviewedAt));
    }

    public static function conclusionMessage(bool $hadError): string
    {
        return $hadError
            ? 'Restrição removida. Havia erro: as respostas erradas foram zeradas.'
            : 'Restrição removida. Não havia erro: a contagem de respostas erradas permanece.';
    }

    private function ensureApproved(ExamQuestion $question): void
    {
        $latest = QuestionReview::query()->where('question_id', $question->id)->latest('id')->first();
        if (in_array($latest?->status, [QuestionReview::APROVADA, QuestionReview::APROVADA_MANUAL], true)) {
            return;
        }

        QuestionReview::withoutEvents(function () use ($question, $latest) {
            QuestionReview::query()->create([
                'tenant_id' => $question->tenant_id,
                'question_id' => $question->id,
                'source_question_id' => $latest?->source_question_id,
                'content_hash' => $latest?->content_hash ?? hash('sha256', 'release:'.$question->id),
                'generation_model' => $latest?->generation_model,
                'gabarito_original' => $latest?->gabarito_original,
                'gabarito_revisor' => $latest?->gabarito_revisor,
                'result' => QuestionReview::APROVADA_MANUAL,
                'status' => QuestionReview::APROVADA_MANUAL,
                'problems' => [],
                'recommendation' => 'aprovada_manual',
                'explanation' => 'Liberada para resposta pelo administrador.',
                'attempts' => 0,
                'content' => ['source' => 'admin_revalidation'],
                'validated_at' => now(),
            ]);
        });
    }
}
