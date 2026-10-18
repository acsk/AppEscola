<?php

namespace App\Services;

use App\Exceptions\QuestionBankException;
use App\Models\ExamQuestion;
use App\Models\ExamQuestionOption;
use App\Models\ExamType;
use App\Models\QuestionImageGeneration;
use App\Services\Ai\QuestionImageService;
use App\Support\QuestionRichText;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Conteúdo de questões (enunciado, alternativas, gabarito, explicação).
 * No banco de questões as avulsas são criadas, editadas e excluídas aqui.
 * Questão de simulado arquivado também tem o conteúdo editado aqui; a exclusão continua pelo simulado.
 * Simulado ainda não arquivado não entra no banco.
 */
class QuestionContentService
{
    /** Campos de conteúdo gravados direto em exam_questions. */
    private const CONTENT_FIELDS = ['type', 'question_text', 'image_url', 'video_url', 'explanation', 'allow_text_answer', 'source_exam_name'];

    public function __construct(
        private readonly QuestionClassificationService $classification,
        private readonly QuestionImageService $images,
    ) {}

    public function createStandalone(int $tenantId, array $data): ExamQuestion
    {
        return DB::transaction(function () use ($tenantId, $data) {
            $generation = null;
            if (! empty($data['generation_id'])) {
                $generation = QuestionImageGeneration::query()->where('tenant_id', $tenantId)
                    ->lockForUpdate()->find($data['generation_id']);
                if ($generation === null) {
                    throw ValidationException::withMessages(['generation_id' => 'Geração de imagem não encontrada para esta escola.']);
                }
                $this->images->assertApproval($generation, $tenantId, $data);
            } elseif (! empty($data['image_url']) && QuestionImageGeneration::query()
                ->whereNull('question_id')->where('image_url', $data['image_url'])
                ->where('origin', '!=', QuestionImageGeneration::ORIGIN_EDITOR_REDRAW)->exists()) {
                throw ValidationException::withMessages(['generation_id' => 'Informe a geração da imagem para aprovar esta questão.']);
            }
            $question = ExamQuestion::create(array_merge(
                $this->contentAttributes($data),
                [
                    'tenant_id' => $tenantId,
                    'exam_id' => null,
                    'exam_type_id' => $this->defaultExamTypeId(),
                    'points' => 1,
                    'order' => 1,
                ]
            ));

            if ($question->type === 'multiple_choice') {
                $this->syncOptions($question, $data['options'] ?? []);
            }
            if ($generation !== null) {
                $generation->update(['question_id' => $question->id, 'status' => 'APPROVED']);
            }
            $this->linkRedrawnImage($question);

            return $this->applyClassification($question, $data, $tenantId);
        });
    }

    public function updateStandalone(ExamQuestion $question, array $data): ExamQuestion
    {
        $this->assertContentEditable($question);

        return DB::transaction(function () use ($question, $data) {
            $question->fill($this->contentAttributes($data) + ['content_edited_at' => now()])->save();
            $this->linkRedrawnImage($question);

            if ($question->type === 'essay') {
                $question->options()->delete();
            } elseif (array_key_exists('options', $data)) {
                $this->syncOptions($question, $data['options'] ?? []);
            }

            return $this->applyClassification($question, $data, (int) $question->tenant_id);
        });
    }

    /** Imagem redesenhada no editor e salva na questão: a geração passa a ser dela (auditoria). */
    private function linkRedrawnImage(ExamQuestion $question): void
    {
        if (trim((string) $question->image_url) === '') {
            return;
        }
        QuestionImageGeneration::query()
            ->where('tenant_id', $question->tenant_id)
            ->where('origin', QuestionImageGeneration::ORIGIN_EDITOR_REDRAW)
            ->whereNull('question_id')
            ->where('image_url', $question->image_url)
            ->update(['question_id' => $question->id, 'status' => 'APPROVED']);
    }

    public function deleteStandalone(ExamQuestion $question): void
    {
        $this->assertStandalone($question);

        DB::transaction(function () use ($question) {
            $question->options()->delete();
            $question->delete();
        });
    }

    /** Substitui as alternativas (mesma regra do formulário de simulado: remove as antigas e recria). */
    public function syncOptions(ExamQuestion $question, array $options): void
    {
        $question->options()->delete();
        foreach (array_values($options) as $i => $option) {
            ExamQuestionOption::create([
                'question_id' => $question->id,
                'option_text' => QuestionRichText::normalize($option['option_text']),
                'is_correct' => (bool) $option['is_correct'],
                'order' => $option['order'] ?? ($i + 1),
                'triggers_text_input' => $option['triggers_text_input'] ?? false,
            ]);
        }
    }

    /** Campos de conteúdo, com enunciado e explicação no formato canônico de formatação. */
    private function contentAttributes(array $data): array
    {
        $attributes = array_intersect_key($data, array_flip(self::CONTENT_FIELDS));
        if (array_key_exists('source_exam_name', $attributes)) {
            $attributes['source_exam_name'] = trim((string) $attributes['source_exam_name']) ?: null;
        }
        foreach (['question_text', 'explanation'] as $field) {
            if (array_key_exists($field, $attributes)) {
                $attributes[$field] = QuestionRichText::normalize($attributes[$field]);
            }
        }

        return $attributes;
    }

    private function applyClassification(ExamQuestion $question, array $data, int $tenantId): ExamQuestion
    {
        $classification = array_intersect_key($data, array_flip(QuestionClassificationService::FIELDS));

        return $classification === []
            ? $question->load(QuestionClassificationService::RELATIONS)
            : $this->classification->apply($question, $classification, $tenantId);
    }

    /** Avulsa, ou questão de simulado já arquivado. Publicado e rascunho continuam só no simulado. */
    private function assertContentEditable(ExamQuestion $question): void
    {
        if ($question->exam_id === null) {
            return;
        }

        $archived = $question->exam()->whereHas('examStatus', fn ($query) => $query->where('slug', 'archived'))->exists();
        if ($archived) {
            return;
        }

        throw QuestionBankException::conflict('Esta questão pertence a um simulado que ainda não foi arquivado. Edite o conteúdo pelo simulado.');
    }

    private function assertStandalone(ExamQuestion $question): void
    {
        if ($question->exam_id !== null) {
            throw QuestionBankException::conflict('Esta questão pertence a um simulado e não pode ser excluída pelo banco.');
        }
    }

    /** Questão avulsa nasce como "Personalizado" (pode ser trocada na classificação). */
    private function defaultExamTypeId(): ?int
    {
        return ExamType::query()->where('slug', 'custom')->value('id');
    }
}
