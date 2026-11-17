<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Assunto do banco liberado para os alunos de um curso, por marcação manual ou por um simulado oficial. */
class QuestionBankTopicRelease extends Model
{
    public const ORIGIN_MANUAL = 'manual';

    public const ORIGIN_EXAM = 'exam';

    protected $fillable = [
        'tenant_id',
        'course_id',
        'subject_topic_id',
        'exam_id',
        'origin',
        'origin_key',
    ];

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function topic(): BelongsTo
    {
        return $this->belongsTo(SubjectTopic::class, 'subject_topic_id');
    }

    public function exam(): BelongsTo
    {
        return $this->belongsTo(Exam::class);
    }
}
