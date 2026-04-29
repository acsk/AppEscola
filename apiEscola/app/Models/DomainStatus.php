<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomainStatus extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'slug';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = ['slug', 'name'];
}
