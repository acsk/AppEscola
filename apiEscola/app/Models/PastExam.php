<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Collection;

class PastExam extends Model
{
    use SoftDeletes, TracksUserActivity;

    protected $fillable = [
        'tenant_id',
        'course_id',
        'subject_id',
        'title',
        'description',
        'exam_year',
        'exam_type',
        'type',
        'content',
        'file_type',
        'file_size',
        'is_published',
        'sort_order',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'exam_year'    => 'integer',
        'file_size'    => 'integer',
        'is_published' => 'boolean',
        'sort_order'   => 'integer',
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
        return $this->belongsToMany(Course::class, 'past_exam_course')->withTimestamps();
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

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('is_published', true);
    }

    public function scopeVisibleToStudentCourses(Builder $query, Collection $courseIds): Builder
    {
        return $query->where(function (Builder $q) use ($courseIds) {
            $q->where(function (Builder $inner) {
                $inner->whereDoesntHave('courses')->whereNull('course_id');
            });

            if ($courseIds->isNotEmpty()) {
                $q->orWhereHas('courses', fn (Builder $c) => $c->whereIn('courses.id', $courseIds))
                    ->orWhere(function (Builder $inner) use ($courseIds) {
                        $inner->whereDoesntHave('courses')
                            ->whereIn('course_id', $courseIds);
                    });
            }
        });
    }
}
