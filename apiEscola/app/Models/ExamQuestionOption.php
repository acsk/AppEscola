<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExamQuestionOption extends Model
{
    protected $fillable = [
        'question_id',
        'option_text',
        'is_correct',
        'triggers_text_input',
        'order',
    ];

    protected $casts = [
        'is_correct'          => 'boolean',
        'triggers_text_input' => 'boolean',
        'order'               => 'integer',
    ];

    public function question(): BelongsTo
    {
        return $this->belongsTo(ExamQuestion::class, 'question_id');
    }
}
