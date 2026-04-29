<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomainPeriod extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'slug';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $table = 'domain_periods';

    protected $fillable = ['slug', 'name', 'order'];
}
