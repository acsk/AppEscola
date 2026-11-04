<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportAccessAction extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['support_access_id', 'method', 'path', 'status'];
}
