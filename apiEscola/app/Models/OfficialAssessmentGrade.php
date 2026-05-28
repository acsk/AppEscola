<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OfficialAssessmentGrade extends Model
{
    use TracksUserActivity;

    protected $fillable = [
        'tenant_id',
        'official_assessment_id',
        'student_id',
        'enrollment_id',
        'grade',
        'is_absent',
        'notes',
        'graded_at',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'grade' => 'decimal:2',
        'is_absent' => 'boolean',
        'graded_at' => 'datetime',
    ];

    public function assessment(): BelongsTo
    {
        return $this->belongsTo(OfficialAssessment::class, 'official_assessment_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function enrollment(): BelongsTo
    {
        return $this->belongsTo(Enrollment::class);
    }
}
