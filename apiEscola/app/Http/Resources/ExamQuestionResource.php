<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExamQuestionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'exam_id'       => $this->exam_id,
            'subject_id'    => $this->subject_id,
            'exam_type_id'  => $this->exam_type_id,
            'exam_type'     => $this->examType?->slug,
            'exam_type_label' => $this->examType?->label,
            'subject'       => $this->whenLoaded('subject', fn () => [
                'id'   => $this->subject->id,
                'name' => $this->subject->name,
            ]),
            'type'          => $this->type,
            'question_text' => $this->question_text,
            'image_url'     => $this->image_url,
            'video_url'     => $this->video_url,
            'points'        => (float) $this->points,
            'order'         => $this->order,
            'explanation'        => $this->explanation,
            'allow_text_answer'  => (bool) $this->allow_text_answer,
            'options'            => ExamQuestionOptionResource::collection($this->whenLoaded('options')),
            'created_at'    => $this->created_at?->toISOString(),
            'updated_at'    => $this->updated_at?->toISOString(),
        ];
    }
}
