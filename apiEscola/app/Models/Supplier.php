<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Fornecedor de despesas. system_key marca os criados pelo sistema (ex.: o próprio banco). */
class Supplier extends Model
{
    public const CORA = 'cora';

    protected $fillable = ['tenant_id', 'name', 'document', 'email', 'phone', 'notes', 'system_key', 'active'];

    protected $casts = ['active' => 'boolean'];
}
