<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Tentativa do aluno num simulado do banco de questões (prática: sem nota oficial nem ranking). */
class PracticeAttempt extends Model
{
    protected $fillable = [
        'tenant_id',
        'student_id',
        'question_set_id',
        'kind',
        'title',
        'question_ids',
        'filters',
        'correction_mode',
        'seconds_per_question',
        'question_count',
        'answered_count',
        'correct_count',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'question_count' => 'integer',
        'question_ids'   => 'array',
        'filters'        => 'array',
        'seconds_per_question' => 'integer',
        'answered_count' => 'integer',
        'correct_count'  => 'integer',
        'started_at'     => 'datetime',
        'finished_at'    => 'datetime',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function questionSet(): BelongsTo
    {
        return $this->belongsTo(QuestionSet::class)->withTrashed();
    }

    public function answers(): HasMany
    {
        return $this->hasMany(PracticeAnswer::class);
    }

    public const KIND_SET = 'set';
    public const KIND_SESSION = 'session';

    public function isSession(): bool
    {
        return $this->kind === self::KIND_SESSION;
    }

    /** Correção a cada questão (só em sessão montada pelo aluno). */
    public function correctsEachQuestion(): bool
    {
        return $this->isSession() && $this->correction_mode === 'each';
    }

    public function isFinished(): bool
    {
        return $this->finished_at !== null;
    }
}
