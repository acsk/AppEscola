<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class NotificationBroadcast extends Model
{
    protected $fillable = [
        'tenant_id',
        'type',
        'title',
        'body',
        'audience_type',
        'audience_params',
        'data',
        'show_on_calendar',
        'starts_at',
        'ends_at',
        'sent_by_user_id',
        'recipients_count',
    ];

    protected $casts = [
        'audience_params'    => 'array',
        'data'               => 'array',
        'show_on_calendar'   => 'boolean',
        'starts_at'          => 'datetime',
        'ends_at'            => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function sentBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by_user_id');
    }

    public function studentNotifications(): HasMany
    {
        return $this->hasMany(StudentNotification::class, 'broadcast_id');
    }
}
