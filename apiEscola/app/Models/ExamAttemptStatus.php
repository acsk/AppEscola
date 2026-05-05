<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExamAttemptStatus extends Model
{
    protected $fillable = ['slug', 'label', 'order'];

    public function attempts(): HasMany
    {
        return $this->hasMany(ExamAttempt::class, 'attempt_status_id');
    }
}
