<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Resposta de prática: sem tentativa = questão avulsa; com tentativa = simulado do banco. */
class PracticeAnswer extends Model
{
    protected $fillable = [
        'tenant_id',
        'student_id',
        'practice_attempt_id',
        'exam_question_id',
        'option_id',
        'is_correct',
        'answered_at',
    ];

    protected $casts = [
        'is_correct'  => 'boolean',
        'answered_at' => 'datetime',
    ];

    /**
     * Respostas que entram em desempenho e ranking: avulsas e de simulados finalizados.
     * As de simulado em andamento ficam de fora para não revelar a correção antes do fim
     * (exceto sessões com correção a cada questão, que já mostraram o gabarito).
     */
    public function scopeCounted(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->whereNull('practice_answers.practice_attempt_id')
            ->orWhereExists(fn ($e) => $e->select(DB::raw(1))->from('practice_attempts as pat')
                ->whereColumn('pat.id', 'practice_answers.practice_attempt_id')
                // Sessão com correção a cada questão já mostrou o gabarito: conta mesmo em andamento.
                ->where(fn ($w) => $w->whereNotNull('pat.finished_at')->orWhere('pat.correction_mode', 'each'))));
    }

    public function attempt(): BelongsTo
    {
        return $this->belongsTo(PracticeAttempt::class, 'practice_attempt_id');
    }

    public function question(): BelongsTo
    {
        return $this->belongsTo(ExamQuestion::class, 'exam_question_id');
    }

    public function option(): BelongsTo
    {
        return $this->belongsTo(ExamQuestionOption::class, 'option_id');
    }
}
