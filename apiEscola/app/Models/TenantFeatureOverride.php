<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TenantFeatureOverride extends Model
{
    protected $fillable = ['tenant_id', 'feature_key', 'enabled', 'reason', 'user_id'];

    protected $casts = ['enabled' => 'boolean'];
}
