<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QuestionTag extends Model
{
    protected $fillable = [
        'tenant_id',
        'name',
        'description',
    ];
}
