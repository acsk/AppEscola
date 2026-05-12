<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InvoiceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'enrollment_id' => $this->enrollment_id,
            'student_id' => $this->student_id,
            'student' => new StudentResource($this->whenLoaded('student')),
            'guardian_id' => $this->guardian_id,
            'guardian' => new GuardianResource($this->whenLoaded('guardian')),
            'type' => $this->type,
            'description' => $this->description,
            'amount' => $this->amount,
            'due_date' => $this->due_date?->toDateString(),
            'paid_at' => $this->paid_at?->toISOString(),
            'status' => $this->status,
            'payment_method' => $this->payment_method,
            'notes' => $this->notes,
            'cora' => [
                'charge_id' => $this->cora_charge_id,
                'status' => $this->cora_status,
                'payment_url' => $this->cora_payment_url,
                'pix_copy_paste' => $this->cora_pix_copy_paste,
                'last_synced_at' => $this->cora_last_synced_at?->toISOString(),
            ],
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
