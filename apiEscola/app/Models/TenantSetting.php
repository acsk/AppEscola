<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'module',
        'key',
        'value',
        'description',
    ];

    protected $casts = [
        'value' => 'array', // JSON wrapper: armazenado como ["v" => <valor real>] para preservar tipo
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /**
     * Desempacota o valor real do JSON envelope.
     */
    public function getTypedValue(): mixed
    {
        $raw = $this->value;

        if (is_array($raw) && array_key_exists('v', $raw)) {
            return $raw['v'];
        }

        return $raw;
    }

    /**
     * Empacota o valor em um envelope JSON para preservar o tipo (bool/int/string/array).
     */
    public static function wrapValue(mixed $value): array
    {
        return ['v' => $value];
    }
}
