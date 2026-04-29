<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomainUserRole extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'slug';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $table = 'domain_user_roles';

    protected $fillable = ['slug', 'name'];
}
