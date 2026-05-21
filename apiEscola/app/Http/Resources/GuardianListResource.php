<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Campos mínimos para listagens, selects e tabelas. */
class GuardianListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'document' => $this->document,
            'email' => $this->email,
            'phone' => $this->phone,
            'relationship' => $this->relationship,
            'students_count' => (int) ($this->students_count ?? 0),
        ];
    }
}
