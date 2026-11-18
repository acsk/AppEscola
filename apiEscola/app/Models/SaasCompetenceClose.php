<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Foto de um mês de cobrança SaaS. Depois de gravada, a quantidade de alunos e o valor não mudam. */
class SaasCompetenceClose extends Model
{
    protected $fillable = [
        'tenant_id', 'competence', 'app_students', 'unit_price', 'app_amount', 'gestao_amount', 'total', 'closed_at', 'user_id',
    ];

    protected $casts = [
        'competence' => 'date',
        'app_students' => 'integer',
        'unit_price' => 'decimal:2',
        'app_amount' => 'decimal:2',
        'gestao_amount' => 'decimal:2',
        'total' => 'decimal:2',
        'closed_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
