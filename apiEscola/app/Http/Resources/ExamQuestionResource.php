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
            // Classificação (mesmo detalhamento do banco de questões); campos novos, aditivos.
            'difficulty_id' => $this->difficulty_id,
            'difficulty'    => $this->whenLoaded('difficulty', fn () => $this->difficulty ? ['id' => $this->difficulty->id, 'name' => $this->difficulty->name] : null),
            'topic_ids'     => $this->whenLoaded('topics', fn () => $this->topics->pluck('id')->map(fn ($id) => (int) $id)->values()),
            'topics'        => $this->whenLoaded('topics', fn () => $this->topics->map(fn ($t) => ['id' => $t->id, 'name' => $t->name])->values()),
            'board_id'      => $this->board_id,
            'board'         => $this->whenLoaded('board', fn () => $this->board ? ['id' => $this->board->id, 'name' => $this->board->name] : null),
            'year'          => $this->year,
            'is_annulled'   => (bool) $this->is_annulled,
            'is_outdated'   => (bool) $this->is_outdated,
            'tags'          => $this->whenLoaded('tags', fn () => $this->tags->pluck('name')->values()),
            'created_at'    => $this->created_at?->toISOString(),
            'updated_at'    => $this->updated_at?->toISOString(),
        ];
    }
}
