<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomainWeekday extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'slug';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $table = 'domain_weekdays';

    protected $fillable = ['slug', 'name', 'order'];
}
