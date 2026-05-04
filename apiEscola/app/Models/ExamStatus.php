<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExamStatus extends Model
{
    protected $fillable = ['slug', 'label', 'order'];

    public function exams(): HasMany
    {
        return $this->hasMany(Exam::class);
    }
}
