<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class PaymentGatewayCustomer extends Model
{
    protected $fillable = [
        'tenant_id',
        'provider',
        'payer_type',
        'payer_id',
        'external_customer_id',
        'raw_response',
    ];

    protected $casts = [
        'raw_response' => 'array',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
