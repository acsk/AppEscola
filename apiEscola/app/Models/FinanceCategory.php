<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Categoria financeira das despesas (Pessoal, Ocupação...). system_key marca as usadas pelo sistema. */
class FinanceCategory extends Model
{
    public const BANK_FEES = 'bank_fees';

    protected $fillable = ['tenant_id', 'name', 'system_key', 'active'];

    protected $casts = ['active' => 'boolean'];
}
