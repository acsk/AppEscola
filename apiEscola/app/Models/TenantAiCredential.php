<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Chave de IA de um tenant (api_key criptografada; nunca sai na resposta). */
class TenantAiCredential extends Model
{
    use TracksUserActivity;

    public const PROVIDERS = ['openrouter', 'openai'];

    protected $fillable = [
        'tenant_id',
        'provider',
        'api_key',
        'key_hint',
        'model',
        'active',
        'configured_at',
    ];

    protected $hidden = ['api_key'];

    protected $casts = [
        'api_key'       => 'encrypted',
        'active'        => 'boolean',
        'configured_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public static function hintFor(string $apiKey): string
    {
        return substr(trim($apiKey), -4);
    }
}
