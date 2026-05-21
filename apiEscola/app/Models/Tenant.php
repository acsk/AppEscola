<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Tenant extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'corporate_name',
        'trade_name',
        'name',
        'slug',
        'cnpj',
        'email',
        'phone',
        'whatsapp',
        'zip_code',
        'street',
        'number',
        'complement',
        'neighborhood',
        'city',
        'state',
        'status',
        'photo_url',
        'settings',
    ];

    protected $casts = [
        'settings' => 'array',
    ];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class);
    }

    public function guardians(): HasMany
    {
        return $this->hasMany(Guardian::class);
    }

    public function courses(): HasMany
    {
        return $this->hasMany(Course::class);
    }

    public function subjects(): HasMany
    {
        return $this->hasMany(Subject::class);
    }

    public function schoolClasses(): HasMany
    {
        return $this->hasMany(SchoolClass::class);
    }

    public function enrollments(): HasMany
    {
        return $this->hasMany(Enrollment::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function paymentProviders(): HasMany
    {
        return $this->hasMany(PaymentProvider::class);
    }

    public function apiTokens(): HasMany
    {
        return $this->hasMany(TenantApiToken::class);
    }

    public function coraCredentials(): HasMany
    {
        return $this->hasMany(TenantCoraCredential::class);
    }

    public function asaasCredentials(): HasMany
    {
        return $this->hasMany(TenantAsaasCredential::class);
    }
}
