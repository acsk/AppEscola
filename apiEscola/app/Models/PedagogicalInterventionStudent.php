<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Aluno de uma intervenção, com o "antes" (na criação) e o "depois" (na conclusão). */
class PedagogicalInterventionStudent extends Model
{
    protected $fillable = ['tenant_id', 'intervention_id', 'student_id', 'baseline_pct', 'baseline_n', 'result_pct', 'result_n'];

    protected $casts = ['baseline_pct' => 'float', 'result_pct' => 'float'];

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }
}
