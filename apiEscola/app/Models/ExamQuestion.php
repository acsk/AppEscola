<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ExamQuestion extends Model
{
    use HasFactory, SoftDeletes, TracksUserActivity;

    protected $fillable = [
        'tenant_id',
        'exam_id',
        'subject_id',
        'exam_type_id',
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
        'points'            => 'decimal:2',
        'order'             => 'integer',
        'allow_text_answer' => 'boolean',
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

    public function options(): HasMany
    {
        return $this->hasMany(ExamQuestionOption::class, 'question_id')->orderBy('order');
    }

    public function answers(): HasMany
    {
        return $this->hasMany(ExamAnswer::class, 'question_id');
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
