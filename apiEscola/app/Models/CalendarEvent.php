<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CalendarEvent extends Model
{
    protected $fillable = [
        'tenant_id',
        'source_type',
        'source_id',
        'type',
        'title',
        'description',
        'starts_at',
        'ends_at',
        'all_day',
        'course_id',
        'school_class_id',
        'student_id',
        'location',
        'audience_type',
        'audience_params',
        'is_published',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'starts_at'       => 'datetime',
        'ends_at'         => 'datetime',
        'all_day'         => 'boolean',
        'is_published'    => 'boolean',
        'audience_params' => 'array',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function schoolClass(): BelongsTo
    {
        return $this->belongsTo(SchoolClass::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function isManual(): bool
    {
        return $this->source_type === null || $this->source_type === 'manual';
    }
}
