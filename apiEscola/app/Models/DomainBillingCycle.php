<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomainBillingCycle extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'slug';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $table = 'domain_billing_cycles';

    protected $fillable = ['slug', 'name', 'months', 'order'];
}
