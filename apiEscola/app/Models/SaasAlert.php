<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaasAlert extends Model
{
    protected $fillable = [
        'fingerprint', 'rule', 'severity', 'tenant_id', 'title', 'detail', 'status', 'occurrences',
        'first_seen_at', 'last_seen_at', 'resolved_at', 'acknowledged_by', 'acknowledged_at', 'notified_at',
    ];

    protected $casts = [
        'first_seen_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'resolved_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'notified_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class)->withTrashed();
    }

    public function acknowledger(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }
}
