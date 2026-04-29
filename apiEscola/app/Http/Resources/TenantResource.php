<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TenantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'             => $this->id,
            'corporate_name' => $this->corporate_name,
            'trade_name'     => $this->trade_name,
            'name'           => $this->name,
            'slug'           => $this->slug,
            'cnpj'           => $this->cnpj,
            'email'          => $this->email,
            'phone'          => $this->phone,
            'whatsapp'       => $this->whatsapp,
            'address'        => [
                'zip_code'     => $this->zip_code,
                'street'       => $this->street,
                'number'       => $this->number,
                'complement'   => $this->complement,
                'neighborhood' => $this->neighborhood,
                'city'         => $this->city,
                'state'        => $this->state,
            ],
            'status'         => $this->status,
            'settings'       => $this->settings,
            'created_at'     => $this->created_at?->toISOString(),
            'updated_at'     => $this->updated_at?->toISOString(),
        ];
    }
}
