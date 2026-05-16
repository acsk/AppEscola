<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PaymentProviderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $isSuperAdmin = $user && $user->role === 'super_admin';

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'logo_url' => $this->logo_url,
            'is_active' => $this->is_active,
            'order' => $this->order,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
            'can_view' => $isSuperAdmin,
            'can_edit' => $isSuperAdmin,
            'can_delete' => $isSuperAdmin,
        ];
    }
}
