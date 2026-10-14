<?php

namespace App\Services\Embeddings;

use App\Contracts\Embeddings\RepositorioEmbeddings;
use App\Models\ExamQuestion;
use App\Models\QuestionEmbedding;

class RepositorioEmbeddingsMysql implements RepositorioEmbeddings
{
    public function candidatos(int $tenantId, ?int $disciplinaId, ?int $assuntoId, string $modelo, string $estrategia, int $limite): array
    {
        $ids = ExamQuestion::query()
            ->inQuestionBank($tenantId)
            ->when($disciplinaId, fn ($q) => $q->where('exam_questions.subject_id', $disciplinaId))
            ->when($assuntoId, fn ($q) => $q->whereHas('topics', fn ($t) => $t->where('subject_topics.id', $assuntoId)))
            ->orderByDesc('exam_questions.id')
            ->limit($limite)
            ->pluck('exam_questions.id');

        if ($ids->isEmpty()) {
            return [];
        }

        $questoes = ExamQuestion::query()
            ->with(['subject:id,name', 'topics:id,name', 'options:id,question_id,option_text,order'])
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');
        $vetores = QuestionEmbedding::query()
            ->whereIn('exam_question_id', $ids)
            ->get()
            ->keyBy('exam_question_id');

        $linhas = [];
        foreach ($ids as $id) {
            $questao = $questoes->get($id);
            if ($questao === null) {
                continue;
            }
            $vetor = $vetores->get($id);
            $compativel = $vetor !== null
                && $vetor->model_name === $modelo
                && $vetor->strategy_version === $estrategia;
            $linhas[] = [
                'question_id' => (int) $questao->id,
                'question_text' => (string) $questao->question_text,
                'options' => $questao->options->sortBy('order')->pluck('option_text')->map(fn ($t) => (string) $t)->all(),
                'subject_id' => $questao->subject_id ? (int) $questao->subject_id : null,
                'subject_name' => $questao->subject?->name,
                'topic_names' => $questao->topics->pluck('name')->map(fn ($n) => (string) $n)->all(),
                'image_url' => $questao->image_url,
                'text_hash' => $vetor?->text_hash,
                'embedding' => $compativel ? array_map('floatval', (array) $vetor->embedding) : null,
                'model_name' => $vetor?->model_name,
                'dimensions' => $vetor?->dimensions,
                'strategy_version' => $vetor?->strategy_version,
            ];
        }

        return $linhas;
    }

    public function salvar(
        int $tenantId,
        int $questaoId,
        ?int $disciplinaId,
        string $modelo,
        int $dimensoes,
        array $vetor,
        string $hash,
        string $estrategia,
        bool $multimodal,
    ): void {
        QuestionEmbedding::query()->updateOrCreate(
            [
                'exam_question_id' => $questaoId,
                'model_name' => $modelo,
                'strategy_version' => $estrategia,
            ],
            [
                'tenant_id' => $tenantId,
                'subject_id' => $disciplinaId,
                'dimensions' => $dimensoes,
                'embedding' => $vetor,
                'text_hash' => $hash,
                'multimodal_required' => $multimodal,
            ]
        );
    }

    public function embeddingDaQuestao(int $questaoId, string $modelo, string $estrategia): ?array
    {
        $row = QuestionEmbedding::query()
            ->where('exam_question_id', $questaoId)
            ->where('model_name', $modelo)
            ->where('strategy_version', $estrategia)
            ->first();
        if ($row === null) {
            return null;
        }

        return [
            'embedding' => array_map('floatval', (array) $row->embedding),
            'dimensions' => (int) $row->dimensions,
            'text_hash' => (string) $row->text_hash,
            'model_name' => (string) $row->model_name,
        ];
    }
}
