<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmailLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['tenant_id', 'user_id', 'provider', 'category', 'to', 'subject', 'status', 'provider_message_id', 'error_code', 'error', 'duration_ms'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
