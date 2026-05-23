<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;
use Illuminate\Database\Eloquent\SoftDeletes;

class Exam extends Model
{
    use HasFactory, SoftDeletes, TracksUserActivity;

    protected $fillable = [
        'tenant_id',
        'course_id',
        'subject_id',
        'exam_status_id',
        'exam_type_id',
        'title',
        'description',
        'duration_minutes',
        'passing_score',
        'starts_at',
        'ends_at',
        'release_results_after_end',
        'allow_retake',
        'max_attempts',
        'min_score_to_retake',
        'created_by',
        'updated_by',
        'deleted_by',
    ];

    protected $casts = [
        'duration_minutes'   => 'integer',
        'passing_score'      => 'decimal:2',
        'starts_at'          => 'datetime',
        'ends_at'            => 'datetime',
        'release_results_after_end' => 'boolean',
        'allow_retake'       => 'boolean',
        'max_attempts'       => 'integer',
        'min_score_to_retake' => 'decimal:2',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function courses(): BelongsToMany
    {
        return $this->belongsToMany(Course::class, 'exam_course')->withTimestamps();
    }

    /** IDs dos cursos vinculados (pivot + legado em course_id). */
    public function linkedCourseIds(): Collection
    {
        $ids = $this->relationLoaded('courses')
            ? $this->courses->pluck('id')
            : $this->courses()->pluck('courses.id');

        if ($ids->isNotEmpty()) {
            return $ids->map(fn ($id) => (int) $id)->values();
        }

        return $this->course_id ? collect([(int) $this->course_id]) : collect();
    }

    /** Simulados visíveis para alunos matriculados em pelo menos um dos cursos informados. */
    public function scopeForStudentCourses(Builder $query, Collection $courseIds): Builder
    {
        return $query->where(function (Builder $q) use ($courseIds) {
            $q->whereHas('courses', fn (Builder $c) => $c->whereIn('courses.id', $courseIds))
                ->orWhere(function (Builder $inner) use ($courseIds) {
                    $inner->whereDoesntHave('courses')
                        ->whereIn('course_id', $courseIds);
                });
        });
    }

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    public function examStatus(): BelongsTo
    {
        return $this->belongsTo(ExamStatus::class);
    }

    public function examType(): BelongsTo
    {
        return $this->belongsTo(ExamType::class);
    }

    public function isPublished(): bool
    {
        return $this->examStatus?->slug === 'published';
    }

    public function questions(): HasMany
    {
        return $this->hasMany(ExamQuestion::class)->orderBy('order');
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(ExamAttempt::class);
    }

    public function supportMaterials(): HasMany
    {
        return $this->hasMany(SupportMaterial::class);
    }

    /** Soma total de pontos do simulado */
    public function totalPoints(): float
    {
        return (float) $this->questions()->sum('points');
    }
}
