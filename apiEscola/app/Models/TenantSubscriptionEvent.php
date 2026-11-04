<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantSubscriptionEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['tenant_id', 'tenant_subscription_id', 'type', 'from_plan_id', 'to_plan_id', 'data', 'user_id'];

    protected $casts = ['data' => 'array'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function fromPlan(): BelongsTo
    {
        return $this->belongsTo(SaasPlan::class, 'from_plan_id')->withTrashed();
    }

    public function toPlan(): BelongsTo
    {
        return $this->belongsTo(SaasPlan::class, 'to_plan_id')->withTrashed();
    }
}
