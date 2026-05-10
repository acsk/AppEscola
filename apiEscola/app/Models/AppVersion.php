<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppVersion extends Model
{
    protected $fillable = [
        'app',
        'version',
        'release',
        'release_date',
    ];

    protected $casts = [
        'version'      => 'integer',
        'release'      => 'integer',
        'release_date' => 'date:Y-m-d',
    ];

    public function getFormattedVersionAttribute(): string
    {
        return sprintf('v%d.%d', $this->version, $this->release);
    }
}
