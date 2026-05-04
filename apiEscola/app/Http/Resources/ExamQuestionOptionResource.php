<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExamQuestionOptionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                  => $this->id,
            'option_text'         => $this->option_text,
            'order'               => $this->order,
            'triggers_text_input' => (bool) $this->triggers_text_input,
            // is_correct só é exposto para admins/professores (nunca para o aluno durante a prova)
            'is_correct'          => $this->when(
                $request->routeIs('exams.*') && ! $request->routeIs('exam-attempts.*'),
                $this->is_correct
            ),
        ];
    }
}
