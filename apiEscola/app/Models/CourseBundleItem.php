<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourseBundleItem extends Model
{
    protected $fillable = [
        'bundle_id',
        'course_id',
    ];

    public function bundle(): BelongsTo
    {
        return $this->belongsTo(CourseBundle::class, 'bundle_id');
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }
}
