<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Centro de custo das despesas (Administrativo, Pedagógico...). */
class CostCenter extends Model
{
    protected $fillable = ['tenant_id', 'name', 'active'];

    protected $casts = ['active' => 'boolean'];
}
