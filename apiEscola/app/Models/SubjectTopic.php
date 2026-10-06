<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** Assunto de uma disciplina; o nome é único dentro da disciplina. */
class SubjectTopic extends Model
{
    protected $fillable = [
        'tenant_id',
        'subject_id',
        'name',
        'description',
    ];

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    public function questions(): BelongsToMany
    {
        return $this->belongsToMany(ExamQuestion::class, 'exam_question_topic', 'subject_topic_id', 'exam_question_id');
    }
}
