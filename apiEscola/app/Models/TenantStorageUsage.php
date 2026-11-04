<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TenantStorageUsage extends Model
{
    protected $fillable = ['tenant_id', 'bytes', 'files', 'by_category', 'measured_at'];

    protected $casts = ['by_category' => 'array', 'measured_at' => 'datetime', 'bytes' => 'integer', 'files' => 'integer'];
}
