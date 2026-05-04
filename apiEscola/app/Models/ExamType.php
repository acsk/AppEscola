<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExamType extends Model
{
    protected $fillable = ['slug', 'label'];

    public function exams(): HasMany
    {
        return $this->hasMany(Exam::class);
    }
}
