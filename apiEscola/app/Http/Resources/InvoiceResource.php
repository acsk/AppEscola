<?php

namespace App\Http\Resources;

use App\Services\InvoiceLifecycleService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InvoiceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $lifecycle = app(InvoiceLifecycleService::class)->permissions($this->resource);

        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'enrollment_id' => $this->enrollment_id,
            'student_id' => $this->student_id,
            'student' => new StudentResource($this->whenLoaded('student')),
            'guardian_id' => $this->guardian_id,
            'guardian' => new GuardianResource($this->whenLoaded('guardian')),
            'type' => $this->type,
            'type_label' => $this->whenLoaded('invoiceType', fn () => $this->invoiceType?->name),
            'description' => $this->description,
            'amount' => $this->amount,
            'due_date' => $this->due_date?->toDateString(),
            'paid_at' => $this->paid_at?->toISOString(),
            'status' => $this->status,
            'payment_method' => $this->payment_method,
            'notes' => $this->notes,
            'edit_reason' => $this->edit_reason,
            'created_by_user' => [
                'id' => $this->created_by,
                'name' => $this->whenLoaded('createdByUser', fn () => $this->createdByUser?->name),
            ],
            'updated_by_user' => [
                'id' => $this->updated_by,
                'name' => $this->whenLoaded('updatedByUser', fn () => $this->updatedByUser?->name),
            ],
            'cora' => [
                'charge_id' => $this->cora_charge_id,
                'status' => $this->cora_status,
                'payment_url' => $this->cora_payment_url,
                'pix_copy_paste' => $this->cora_pix_copy_paste,
                'qr_code_image_url' => data_get($this->cora_payload, 'pix.qr_code_image_url')
                    ?? data_get($this->cora_payload, 'pix.qr_code_url')
                    ?? data_get($this->cora_payload, 'payment_options.pix.qr_code_url')
                    ?? data_get($this->cora_payload, 'qr_code_image_url'),
                'boleto_number' => $this->boleto_number,
                'boleto_digitable' => $this->boleto_digitable,
                'last_synced_at' => $this->cora_last_synced_at?->toISOString(),
            ],
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
            'can_edit' => $lifecycle['can_edit'],
            'can_cancel' => $lifecycle['can_cancel'],
            'can_delete' => $lifecycle['can_delete'],
            'requires_cora_cancel_before_delete' => $lifecycle['requires_cora_cancel_before_delete'],
            'cancel_block_reason' => $lifecycle['cancel_block_reason'],
            'delete_block_reason' => $lifecycle['delete_block_reason'],
            'lifecycle_hint' => $lifecycle['lifecycle_hint'],
        ];
    }
}
