<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TenantQuotaOverride extends Model
{
    protected $fillable = ['tenant_id', 'resource', 'limit_value', 'reason', 'user_id'];

    protected $casts = ['limit_value' => 'integer'];
}
