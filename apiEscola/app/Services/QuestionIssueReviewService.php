<?php

namespace App\Services;

use App\Models\ExamQuestion;
use App\Models\QuestionIssueReview;
use App\Models\QuestionReview;
use App\Models\TenantSetting;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Aviso de erro do aluno: com o mínimo de alunos diferentes configurado pela escola, a questão
 * vai para análise e fica sem validação até o administrador analisar.
 * A restrição só sai no salvar, quando ele confirma se havia erro.
 * Havia erro: a contagem de erros do painel zera. Não havia: a contagem permanece.
 * As respostas de prática e as notas oficiais do simulado permanecem.
 */
class QuestionIssueReviewService
{
    public const SETTINGS_MODULE = 'question_bank';

    public const KEY_REPORT_THRESHOLD = 'issue_report_threshold';

    public const THRESHOLD_MIN = 1;

    public const THRESHOLD_MAX = 50;

    /** @var array<int, int> */
    private static array $thresholds = [];

    /** Alunos diferentes que precisam avisar erro para a questão ir para análise. */
    public static function reportThreshold(int $tenantId): int
    {
        if (! isset(self::$thresholds[$tenantId])) {
            $row = TenantSetting::query()->where('tenant_id', $tenantId)
                ->where('module', self::SETTINGS_MODULE)->where('key', self::KEY_REPORT_THRESHOLD)->first();
            $value = $row ? (int) $row->getTypedValue() : (int) config('practice.issue_report_threshold', 3);
            self::$thresholds[$tenantId] = max(self::THRESHOLD_MIN, min(self::THRESHOLD_MAX, $value));
        }

        return self::$thresholds[$tenantId];
    }

    public static function updateReportThreshold(int $tenantId, int $threshold): int
    {
        $threshold = max(self::THRESHOLD_MIN, min(self::THRESHOLD_MAX, $threshold));
        TenantSetting::updateOrCreate(
            ['tenant_id' => $tenantId, 'module' => self::SETTINGS_MODULE, 'key' => self::KEY_REPORT_THRESHOLD],
            [
                'value' => TenantSetting::wrapValue($threshold),
                'description' => 'Alunos diferentes que precisam avisar erro para a questão ir para análise.',
            ],
        );
        unset(self::$thresholds[$tenantId]);

        return $threshold;
    }

    /** Questão com avisos suficientes de alunos diferentes: está em análise (fora da prática e do ranking). */
    public function isUnderReview(ExamQuestion $question): bool
    {
        $count = isset($question->issue_reports_count)
            ? (int) $question->issue_reports_count
            : $question->issueReports()->count();

        return $count >= self::reportThreshold((int) $question->tenant_id);
    }

    /** Depois de um novo aviso: ao atingir o mínimo de alunos, a questão vai para análise. */
    public function registerStudentReport(ExamQuestion $question): bool
    {
        if (! $this->isUnderReview($question)) {
            return false;
        }
        $this->suspendForStudentReport($question);

        return true;
    }

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
     * Libera uma questão que não está em análise.
     * Em análise, não altera nada: a restrição espera a confirmação no salvar.
     */
    public function releaseForAnswers(ExamQuestion $question, bool $resetErrors = false): bool
    {
        if ($this->isUnderReview($question)) {
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
