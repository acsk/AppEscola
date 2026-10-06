<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QuestionBoard extends Model
{
    protected $fillable = [
        'tenant_id',
        'name',
        'description',
    ];
}
