<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use InvalidArgumentException;

class ExamAttempt extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'exam_id',
        'student_id',
        'attempt_status_id',
        'started_at',
        'finished_at',
        'score',
        'max_score',
        'percentage',
        'status',
    ];

    protected $casts = [
        'started_at'  => 'datetime',
        'finished_at' => 'datetime',
        'score'       => 'decimal:2',
        'max_score'   => 'decimal:2',
        'percentage'  => 'decimal:2',
    ];

    public function exam(): BelongsTo
    {
        return $this->belongsTo(Exam::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function attemptStatus(): BelongsTo
    {
        return $this->belongsTo(ExamAttemptStatus::class, 'attempt_status_id');
    }

    public function answers(): HasMany
    {
        return $this->hasMany(ExamAnswer::class, 'attempt_id');
    }

    public function scopeWhereStatus(Builder $query, string $statusSlug): Builder
    {
        return $query->whereHas('attemptStatus', fn ($q) => $q->where('slug', $statusSlug));
    }

    public function getStatusAttribute(): ?string
    {
        return $this->attemptStatus?->slug;
    }

    public function isResultReleasePending(): bool
    {
        if ($this->status !== 'awaiting_release') {
            return false;
        }

        $exam = $this->relationLoaded('exam')
            ? $this->exam
            : $this->exam()->first(['id', 'release_results_after_end', 'ends_at']);

        return (bool) $exam?->release_results_after_end
            && $exam?->ends_at !== null
            && $exam->ends_at->isFuture();
    }

    public function visibleStatusFor(?string $role): ?string
    {
        if ($role === 'aluno' && $this->isResultReleasePending()) {
            return 'awaiting_release';
        }

        return $this->status;
    }

    public function setStatusAttribute(?string $value): void
    {
        if ($value === null) {
            $this->attributes['attempt_status_id'] = null;
            return;
        }

        $statusId = ExamAttemptStatus::query()->where('slug', $value)->value('id');

        if (! $statusId) {
            throw new InvalidArgumentException("Status de tentativa inválido: {$value}");
        }

        $this->attributes['attempt_status_id'] = $statusId;
    }
}
