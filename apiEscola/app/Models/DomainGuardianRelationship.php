<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomainGuardianRelationship extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'slug';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $table = 'domain_guardian_relationships';

    protected $fillable = ['slug', 'name'];
}
