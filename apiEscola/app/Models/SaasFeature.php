<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaasFeature extends Model
{
    public const ENABLED = 'enabled';
    public const BETA = 'beta';
    public const DISABLED = 'disabled';

    protected $fillable = ['key', 'name', 'description', 'global_status', 'order'];
}
