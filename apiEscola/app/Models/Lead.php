<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Lead extends Model
{
    protected $fillable = [
        'name',
        'role',
        'email',
        'phone',
        'institution',
        'students_range',
        'message',
        'source',
        'ip',
        'user_agent',
    ];
}
