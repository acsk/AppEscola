<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Aluno vinculado ao responsável (detalhe). */
class GuardianStudentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'enrollment_number' => $this->enrollment_number,
            'status' => $this->status,
            'pivot' => $this->when($this->pivot !== null, fn () => [
                'is_financial_responsible' => (bool) $this->pivot?->is_financial_responsible,
                'is_pedagogical_responsible' => (bool) $this->pivot?->is_pedagogical_responsible,
                'can_access_portal' => (bool) $this->pivot?->can_access_portal,
            ]),
        ];
    }
}
