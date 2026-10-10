<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ExamQuestion extends Model
{
    use HasFactory, SoftDeletes, TracksUserActivity;

    protected $fillable = [
        'tenant_id',
        'exam_id',
        'source_exam_name',
        'subject_id',
        'exam_type_id',
        'difficulty_id',
        'board_id',
        'year',
        'is_annulled',
        'is_outdated',
        'revalidated_at',
        'type',
        'question_text',
        'image_url',
        'video_url',
        'points',
        'order',
        'explanation',
        'allow_text_answer',
        'created_by',
        'updated_by',
        'deleted_by',
    ];

    protected $casts = [
        'points' => 'decimal:2',
        'order' => 'integer',
        'allow_text_answer' => 'boolean',
        'year' => 'integer',
        'is_annulled' => 'boolean',
        'is_outdated' => 'boolean',
        'revalidated_at' => 'datetime',
    ];

    public function exam(): BelongsTo
    {
        return $this->belongsTo(Exam::class);
    }

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    public function examType(): BelongsTo
    {
        return $this->belongsTo(ExamType::class);
    }

    public function difficulty(): BelongsTo
    {
        return $this->belongsTo(QuestionDifficulty::class, 'difficulty_id');
    }

    public function board(): BelongsTo
    {
        return $this->belongsTo(QuestionBoard::class, 'board_id');
    }

    public function topics(): BelongsToMany
    {
        return $this->belongsToMany(SubjectTopic::class, 'exam_question_topic', 'exam_question_id', 'subject_topic_id')
            ->orderBy('subject_topics.name');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(QuestionTag::class, 'exam_question_tag', 'exam_question_id', 'question_tag_id')
            ->orderBy('question_tags.name');
    }

    public function issueReports(): HasMany
    {
        return $this->hasMany(QuestionIssueReport::class, 'exam_question_id');
    }

    public function options(): HasMany
    {
        return $this->hasMany(ExamQuestionOption::class, 'question_id')->orderBy('order');
    }

    public function answers(): HasMany
    {
        return $this->hasMany(ExamAnswer::class, 'question_id');
    }

    /** Banco de questões: avulsas e de simulados não excluídos (questões de simulado excluído ficam de fora). */
    public function scopeInQuestionBank(Builder $query, int $tenantId): Builder
    {
        return $query->where('exam_questions.tenant_id', $tenantId)
            ->where(fn (Builder $q) => $q->whereNull('exam_questions.exam_id')
                ->orWhereHas('exam'));
    }

    /**
     * Questões que o aluno pode praticar: avulsas (questões de simulado oficial nunca vazam), objetivas,
     * com enunciado, ao menos 2 alternativas preenchidas e exatamente uma correta; sem anuladas/desatualizadas.
     */
    public function scopePracticable(Builder $query, int $tenantId): Builder
    {
        return $query->answerable($tenantId)->approvedForPractice()->whereNull('exam_questions.exam_id');
    }

    /**
     * Prática avulsa do aluno: questões do banco e as de simulados oficiais já encerrados
     * (o gabarito de simulado em andamento ou ainda não aplicado continua protegido).
     */
    public function scopePracticeAvailable(Builder $query, int $tenantId): Builder
    {
        return $query->answerable($tenantId)->approvedForPractice()->where(fn (Builder $q) => $q->whereNull('exam_questions.exam_id')
            ->orWhereHas('exam', fn (Builder $e) => $e->closed()));
    }

    /** A última revisão pedagógica está aprovada (automática ou manual). Sem isso a questão não vai ao aluno. */
    public function scopeApprovedForPractice(Builder $query): Builder
    {
        self::whereLatestReviewApproved($query, 'exam_questions.id');

        return $query;
    }

    public static function whereLatestReviewApproved(object $query, string $questionColumn): void
    {
        $query->whereExists(function ($sub) use ($questionColumn) {
            $sub->selectRaw('1')
                ->from('question_reviews as qr')
                ->whereColumn('qr.question_id', $questionColumn)
                ->whereIn('qr.status', [QuestionReview::APROVADA, QuestionReview::APROVADA_MANUAL])
                ->whereRaw('qr.id = (select max(latest.id) from question_reviews as latest where latest.question_id = qr.question_id)');
        });
    }

    /** Objetiva, válida, com enunciado (texto ou imagem), exatamente uma correta e ao menos duas alternativas. */
    public function scopeAnswerable(Builder $query, int $tenantId): Builder
    {
        return $query->where('exam_questions.tenant_id', $tenantId)
            ->where('exam_questions.type', 'multiple_choice')
            ->where('exam_questions.is_annulled', false)
            ->where('exam_questions.is_outdated', false)
            ->where(fn (Builder $q) => $q->where(fn (Builder $t) => $t->whereNotNull('exam_questions.question_text')->where('exam_questions.question_text', '!=', ''))
                ->orWhere(fn (Builder $i) => $i->whereNotNull('exam_questions.image_url')->where('exam_questions.image_url', '!=', '')))
            ->whereHas('options', fn (Builder $o) => $o->where('is_correct', true), '=', 1)
            ->whereHas('options', fn (Builder $o) => $o->whereNotNull('option_text')->where('option_text', '!=', ''), '>=', 2);
    }

    /** Mesma regra de scopePracticable, para questões já carregadas (com alternativas). */
    public function isPracticable(): bool
    {
        if ($this->exam_id !== null || ! $this->isMultipleChoice() || $this->is_annulled || $this->is_outdated || ! $this->hasEnunciado()) {
            return false;
        }
        $options = $this->relationLoaded('options') ? $this->options : $this->options()->get();

        return $options->filter(fn ($o) => trim((string) $o->option_text) !== '')->count() >= 2
            && $options->where('is_correct', true)->count() === 1
            && $this->hasApprovedReview();
    }

    public function hasApprovedReview(): bool
    {
        $status = QuestionReview::query()->where('question_id', $this->id)->latest('id')->value('status');

        return in_array($status, [QuestionReview::APROVADA, QuestionReview::APROVADA_MANUAL], true);
    }

    public function isMultipleChoice(): bool
    {
        return $this->type === 'multiple_choice';
    }

    /**
     * Questão pronta para uso em simulado publicado (enunciado, pontuação e alternativas válidas).
     */
    public function isComplete(): bool
    {
        if (! $this->hasEnunciado() || (float) $this->points <= 0) {
            return false;
        }

        if ($this->type === 'essay') {
            return true;
        }

        if ($this->type !== 'multiple_choice') {
            return false;
        }

        $filledOptions = $this->relationLoaded('options')
            ? $this->options->filter(fn ($option) => trim((string) $option->option_text) !== '')
            : $this->options()->where('option_text', '!=', '')->whereNotNull('option_text')->get()
                ->filter(fn ($option) => trim((string) $option->option_text) !== '');

        if ($filledOptions->count() < 2) {
            return false;
        }

        return $filledOptions->where('is_correct', true)->count() === 1;
    }

    public function hasEnunciado(): bool
    {
        return trim((string) ($this->question_text ?? '')) !== ''
            || trim((string) ($this->image_url ?? '')) !== '';
    }
}
