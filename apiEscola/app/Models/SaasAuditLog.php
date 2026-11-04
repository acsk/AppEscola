<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaasAuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'tenant_id', 'action', 'description', 'changes', 'ip'];

    protected $casts = ['changes' => 'array'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
