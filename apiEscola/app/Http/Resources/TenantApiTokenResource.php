<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TenantApiTokenResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'name' => $this->name,
            'abilities' => $this->abilities,
            'last_used_at' => $this->last_used_at?->toISOString(),
            'expires_at' => $this->expires_at?->toISOString(),
            'status' => $this->status,
            'is_active' => $this->isActive(),
            // 'plain_token' é incluído apenas na criação, via merge no controller
            'plain_token' => $this->when($this->additional['plain_token'] ?? null, fn () => $this->additional['plain_token']),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
