<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GuardianResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'user_id' => $this->user_id,
            'name' => $this->name,
            'document' => $this->document,
            'email' => $this->email,
            'phone' => $this->phone,
            'relationship' => $this->relationship,
            'pivot' => $this->when($this->pivot !== null, fn () => [
                'is_financial_responsible' => (bool) $this->pivot?->is_financial_responsible,
                'is_pedagogical_responsible' => (bool) $this->pivot?->is_pedagogical_responsible,
                'can_access_portal' => (bool) $this->pivot?->can_access_portal,
            ]),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
