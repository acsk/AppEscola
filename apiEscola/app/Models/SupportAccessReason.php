<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportAccessReason extends Model
{
    protected $fillable = ['name', 'requires_details', 'order', 'active'];

    protected $casts = [
        'requires_details' => 'boolean',
        'active' => 'boolean',
    ];
}
