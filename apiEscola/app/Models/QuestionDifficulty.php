<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Dificuldade de questão (global); ordenada por sort_order, não pelo nome. */
class QuestionDifficulty extends Model
{
    protected $fillable = [
        'name',
        'description',
        'sort_order',
    ];

    protected $casts = [
        'sort_order' => 'integer',
    ];
}
