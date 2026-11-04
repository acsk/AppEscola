<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiUsageLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'tenant_id', 'user_id', 'feature', 'provider', 'model', 'endpoint', 'credential_source',
        'prompt_tokens', 'completion_tokens', 'estimated_cost_usd', 'provider_cost_usd', 'status', 'error_code', 'duration_ms',
    ];
}
