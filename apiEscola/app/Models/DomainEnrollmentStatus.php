<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomainEnrollmentStatus extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'slug';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $table = 'domain_enrollment_statuses';

    protected $fillable = ['slug', 'name'];
}
