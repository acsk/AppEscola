<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantCoraCredential extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'client_id',
        'certificate_path',
        'private_key_path',
        'environment',
        'active',
        'configured_at',
        'test_account_main_cpf',
        'test_account_main_password',
        'test_account_secondary_cpf',
        'test_account_secondary_password',
    ];

    protected $casts = [
        'active' => 'boolean',
        'configured_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function isProduction(): bool
    {
        return in_array(strtolower($this->environment), ['prod', 'production'], true);
    }
}
