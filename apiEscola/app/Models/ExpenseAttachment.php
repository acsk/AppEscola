<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Comprovante de uma despesa, guardado no disco privado. */
class ExpenseAttachment extends Model
{
    protected $fillable = ['tenant_id', 'expense_id', 'path', 'original_name', 'mime', 'size', 'uploaded_by'];
}
