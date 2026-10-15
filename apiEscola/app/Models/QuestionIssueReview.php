<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Revisão do administrador depois que um ou mais alunos marcaram a questão. */
class QuestionIssueReview extends Model
{
    protected $fillable = [
        'tenant_id',
        'exam_question_id',
        'reviewed_by',
        'reviewer_name',
        'had_error',
        'reviewed_at',
    ];

    protected $casts = [
        'had_error' => 'boolean',
        'reviewed_at' => 'datetime',
    ];

    public function question(): BelongsTo
    {
        return $this->belongsTo(ExamQuestion::class, 'exam_question_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
