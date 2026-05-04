<?php

namespace App\Traits;

use Illuminate\Support\Facades\Auth;

/**
 * Registra automaticamente quem criou, editou e excluiu um registro.
 * Requer as colunas: created_by (unsignedBigInteger nullable),
 *                    updated_by (unsignedBigInteger nullable),
 *                    deleted_by (unsignedBigInteger nullable).
 */
trait TracksUserActivity
{
    public static function bootTracksUserActivity(): void
    {
        static::creating(function ($model) {
            $model->created_by = Auth::id();
            $model->updated_by = Auth::id();
        });

        static::updating(function ($model) {
            $model->updated_by = Auth::id();
        });

        static::deleting(function ($model) {
            // Só preenche deleted_by se o modelo usa SoftDeletes
            if (in_array('Illuminate\Database\Eloquent\SoftDeletes', class_uses_recursive($model))) {
                $model->deleted_by = Auth::id();
                $model->saveQuietly();
            }
        });
    }
}
