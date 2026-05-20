<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $subjects = $this->whenLoaded('subjects', function () {
            return $this->subjects->map(fn ($subject) => [
                'id' => $subject->id,
                'name' => $subject->name,
                'status' => $subject->status,
            ])->values();
        });

        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'is_tenant_owner' => (bool) $this->is_tenant_owner,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            'status' => $this->status,
            'password_change_required' => (bool) $this->password_change_required,
            'student_id' => $this->role === 'aluno' ? optional($this->student)->id : null,
            'photo_url' => $this->role === 'aluno' ? optional($this->student)->photo_url : null,
            'tenant' => $this->when(
                $this->relationLoaded('tenant') && $this->tenant,
                fn () => [
                    'id' => $this->tenant->id,
                    'name' => $this->tenant->name,
                    'trade_name' => $this->tenant->trade_name,
                    'corporate_name' => $this->tenant->corporate_name,
                    'slug' => $this->tenant->slug,
                    'cnpj' => $this->tenant->cnpj,
                    'email' => $this->tenant->email,
                    'phone' => $this->tenant->phone,
                    'whatsapp' => $this->tenant->whatsapp,
                    'photo_url' => $this->tenant->photo_url,
                    'address' => $this->formatTenantAddress($this->tenant),
                ],
            ),
            'student' => $this->when(
                $this->relationLoaded('student') && $this->student,
                fn () => [
                    'id' => $this->student->id,
                    'enrollment_number' => $this->student->enrollment_number,
                    'document' => $this->student->document,
                    'phone' => $this->student->phone,
                ],
            ),
            'subject_ids' => $this->whenLoaded('subjects', fn () => $this->subjects->pluck('id')->values()),
            'subjects' => $subjects,
            'email_verified_at' => $this->email_verified_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }

    private function formatTenantAddress($tenant): ?string
    {
        $parts = array_filter([
            trim(implode(', ', array_filter([$tenant->street, $tenant->number]))),
            $tenant->neighborhood,
            $tenant->city && $tenant->state ? "{$tenant->city}/{$tenant->state}" : ($tenant->city ?: $tenant->state),
            $tenant->zip_code ? "CEP {$tenant->zip_code}" : null,
        ]);

        return $parts ? implode(' · ', $parts) : null;
    }
}
