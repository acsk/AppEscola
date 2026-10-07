<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Simulado do banco de questões (painel). */
class QuestionSetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                 => $this->id,
            'title'              => $this->title,
            'description'        => $this->description,
            'origin'             => $this->origin,
            'status'             => $this->status,
            'source_exam_name'   => $this->source_exam_name,
            'exam_type'          => $this->examType ? [
                'id'       => $this->examType->id,
                'slug'     => $this->examType->slug,
                'label'    => $this->examType->label,
                'logo_url' => $this->examType->logo_url,
            ] : null,
            'questions_count'    => $this->items_count ?? null,
            'attempts_count'     => $this->attempts_count ?? null,
            'practicable_count'  => $this->when(isset($this->practicable_count), fn () => $this->practicable_count),
            'created_at'         => $this->created_at?->toIso8601String(),
            'updated_at'         => $this->updated_at?->toIso8601String(),
        ];
    }
}
