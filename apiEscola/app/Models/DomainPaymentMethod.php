<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomainPaymentMethod extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'slug';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $table = 'domain_payment_methods';

    protected $fillable = ['slug', 'name'];
}
