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
