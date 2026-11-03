<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Intervenção pedagógica do acompanhamento (BI). */
class PedagogicalIntervention extends Model
{
    use SoftDeletes;

    public const KIND_INDIVIDUAL = 'individual';

    public const KIND_GROUP = 'group';

    public const TYPES = [
        'practice_list' => 'Lista direcionada',
        'reinforcement_class' => 'Aula de reforço',
        'diagnostic_assessment' => 'Simulado diagnóstico',
        'individual_follow_up' => 'Acompanhamento individual',
        'guardian_contact' => 'Contato com responsável',
        'other' => 'Outra',
    ];

    public const REASONS = [
        'below_goal' => 'Aproveitamento abaixo da meta',
        'declining' => 'Queda em avaliações comparáveis',
        'low_attendance' => 'Frequência baixa',
        'no_evolution' => 'Sem evolução comparável',
        'manual' => 'Indicação da equipe',
    ];

    public const STATUS_PLANNED = 'planned';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_REASSESSMENT = 'reassessment';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_CANCELLED = 'cancelled';

    /** Situações em aberto (bloqueiam nova sugestão para o aluno). */
    public const OPEN = [self::STATUS_PLANNED, self::STATUS_IN_PROGRESS, self::STATUS_REASSESSMENT];

    protected $fillable = [
        'tenant_id', 'kind', 'type', 'title', 'reason_code', 'reason_detail', 'subject_id', 'subject_topic_id',
        'school_class_id', 'status', 'responsible_user_id', 'starts_on', 'reassess_on', 'completed_at',
        'cancelled_at', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'starts_on' => 'date',
        'reassess_on' => 'date',
        'completed_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function students(): HasMany
    {
        return $this->hasMany(PedagogicalInterventionStudent::class, 'intervention_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(PedagogicalInterventionEvent::class, 'intervention_id')->orderBy('occurred_at')->orderBy('id');
    }

    public function responsible(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsible_user_id');
    }

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    public function topic(): BelongsTo
    {
        return $this->belongsTo(SubjectTopic::class, 'subject_topic_id');
    }

    public function schoolClass(): BelongsTo
    {
        return $this->belongsTo(SchoolClass::class);
    }
}
