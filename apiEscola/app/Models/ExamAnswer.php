<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExamAnswer extends Model
{
    protected $fillable = [
        'attempt_id',
        'question_id',
        'option_id',
        'text_answer',
        'is_correct',
        'points_earned',
    ];

    protected $casts = [
        'is_correct'    => 'boolean',
        'points_earned' => 'decimal:2',
    ];

    public function attempt(): BelongsTo
    {
        return $this->belongsTo(ExamAttempt::class, 'attempt_id');
    }

    public function question(): BelongsTo
    {
        return $this->belongsTo(ExamQuestion::class, 'question_id');
    }

    public function option(): BelongsTo
    {
        return $this->belongsTo(ExamQuestionOption::class, 'option_id');
    }
}
