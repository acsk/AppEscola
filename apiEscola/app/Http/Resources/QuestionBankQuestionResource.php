<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Questão no banco de questões: conteúdo resumido + classificação. Alternativas só quando carregadas (detalhe). */
class QuestionBankQuestionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'origin' => $this->exam_id ? 'simulado' : 'avulsa',
            'source_exam_name' => $this->source_exam_name,
            'exam' => $this->exam ? ['id' => $this->exam->id, 'title' => $this->exam->title] : null,
            'type' => $this->type,
            'question_text' => $this->question_text,
            'image_url' => $this->image_url,
            'has_explanation' => trim((string) $this->explanation) !== '',
            'explanation' => $this->when($this->relationLoaded('options'), $this->explanation),
            'options' => $this->whenLoaded('options', fn () => $this->options->map(fn ($option) => [
                'id' => $option->id,
                'option_text' => $option->option_text,
                'is_correct' => (bool) $option->is_correct,
                'order' => $option->order,
            ])->values()),

            'subject_id' => $this->subject_id,
            'subject' => $this->subject ? ['id' => $this->subject->id, 'name' => $this->subject->name] : null,
            'topic_ids' => $this->topics->pluck('id')->values(),
            'topics' => $this->topics->map(fn ($t) => ['id' => $t->id, 'name' => $t->name])->values(),
            'board_id' => $this->board_id,
            'board' => $this->board ? ['id' => $this->board->id, 'name' => $this->board->name] : null,
            'year' => $this->year,
            'difficulty_id' => $this->difficulty_id,
            'difficulty' => $this->difficulty ? [
                'id' => $this->difficulty->id,
                'name' => $this->difficulty->name,
                'sort_order' => $this->difficulty->sort_order,
            ] : null,
            'exam_type_id' => $this->exam_type_id,
            'exam_type' => $this->examType ? ['id' => $this->examType->id, 'label' => $this->examType->label] : null,
            'issue_reports_count' => $this->when(isset($this->issue_reports_count), (int) $this->issue_reports_count),
            'wrong_count' => $this->when(isset($this->wrong_count), (int) $this->wrong_count),
            'answer_count' => $this->when(isset($this->answer_count), (int) $this->answer_count),
            'error_rate' => $this->when(
                isset($this->answer_count),
                (int) $this->answer_count > 0 ? round(((int) $this->wrong_count / (int) $this->answer_count) * 100, 1) : null
            ),
            'revalidated_at' => $this->revalidated_at?->toIso8601String(),
            'is_annulled' => (bool) $this->is_annulled,
            'is_outdated' => (bool) $this->is_outdated,
            'tags' => $this->tags->pluck('name')->values(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
