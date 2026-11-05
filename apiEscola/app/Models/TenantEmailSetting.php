<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TenantEmailSetting extends Model
{
    protected $fillable = [
        'tenant_id', 'provider', 'api_key', 'key_hint', 'from_email', 'from_name', 'reply_to', 'active',
        'domain_status', 'verified_at', 'last_error', 'configured_at',
    ];

    protected $hidden = ['api_key'];

    protected $casts = [
        'api_key' => 'encrypted',
        'active' => 'boolean',
        'verified_at' => 'datetime',
        'configured_at' => 'datetime',
    ];
}
