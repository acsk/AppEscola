<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Próxima revisão de uma questão que o aluno errou. Não entra como questão inédita no ranking. */
class StudentReviewItem extends Model
{
    protected $fillable = [
        'tenant_id',
        'student_id',
        'exam_question_id',
        'box',
        'next_review_on',
        'reviews_count',
        'last_correct',
        'history',
    ];

    protected $casts = [
        'box' => 'integer',
        'next_review_on' => 'date',
        'reviews_count' => 'integer',
        'last_correct' => 'boolean',
        'history' => 'array',
    ];

    public function question(): BelongsTo
    {
        return $this->belongsTo(ExamQuestion::class, 'exam_question_id');
    }
}
