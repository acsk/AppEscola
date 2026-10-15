<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Aluno marcou que a questão tem um erro e precisa de revisão. */
class QuestionIssueReport extends Model
{
    protected $fillable = ['tenant_id', 'student_id', 'exam_question_id', 'note'];

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }
}
