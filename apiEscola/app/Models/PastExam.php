<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
            $q->whereNull('course_id');

            if ($courseIds->isNotEmpty()) {
                $q->orWhereIn('course_id', $courseIds);
            }
        });
    }
}
