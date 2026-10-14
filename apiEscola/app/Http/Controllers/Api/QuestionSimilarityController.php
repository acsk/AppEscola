<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\EmbeddingException;
use App\Http\Controllers\Controller;
use App\Models\ExamQuestion;
use App\Services\Ai\AiCredentialResolver;
use App\Services\Embeddings\BuscaSemanticaQuestoesService;
use App\Services\Embeddings\IndexadorEmbeddings;
use App\Services\ExamAccessService;
use App\Contracts\Embeddings\RegistroUsoEmbeddings;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Busca semântica e indexação. Não grava a questão e não aprova duplicata quando o provedor falha. */
class QuestionSimilarityController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly AiCredentialResolver $credenciais,
        private readonly BuscaSemanticaQuestoesService $busca,
        private readonly IndexadorEmbeddings $indexador,
        private readonly RegistroUsoEmbeddings $usos,
    ) {}

    public function buscar(Request $request): JsonResponse
    {
        return $this->consultar($request, false);
    }

    public function verificar(Request $request): JsonResponse
    {
        return $this->consultar($request, true);
    }

    public function daQuestao(Request $request, int $question): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $model = ExamQuestion::query()->inQuestionBank($tenantId)->with(['options', 'subject:id,name', 'topics:id,name'])->findOrFail($question);
        $request->merge([
            'question_text' => $model->question_text,
            'subject_id' => $model->subject_id,
            'topic_id' => $model->topics->first()?->id,
            'image_url' => $model->image_url,
            'options' => $model->options->map(fn ($o) => ['option_text' => $o->option_text])->all(),
            'ignorar_ids' => [$model->id],
        ]);

        return $this->consultar($request, false);
    }

    public function reindexar(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $limite = max(1, min(20, (int) $request->input('limite', 10)));
        $resultado = $this->indexador->processar($request->user(), $tenantId, $limite);

        return $this->success($resultado, 'Lote de indexação processado. O restante segue no cron.');
    }

    public function metricas(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);

        return $this->success($this->usos->metricas($tenantId));
    }

    private function consultar(Request $request, bool $soAlerta): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $data = $request->validate([
            'question_text' => ['required', 'string', 'max:20000'],
            'subject_id' => ['nullable', 'integer'],
            'topic_id' => ['nullable', 'integer'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'disciplina' => ['nullable', 'string', 'max:120'],
            'assuntos' => ['nullable', 'array', 'max:10'],
            'assuntos.*' => ['string', 'max:120'],
            'options' => ['nullable', 'array', 'max:10'],
            'options.*.option_text' => ['nullable', 'string', 'max:5000'],
            'limite' => ['nullable', 'integer', 'between:1,20'],
            'ignorar_ids' => ['nullable', 'array', 'max:20'],
            'ignorar_ids.*' => ['integer'],
        ]);
        $credencial = $this->credenciais->resolve($request->user(), $tenantId);
        if ($credencial === null) {
            return $this->error('Sem chave de IA para verificar semelhança. A questão não foi aprovada como original.', ['code' => 'embedding_unavailable'], 503);
        }

        try {
            $busca = $this->busca->buscarQuestoesSimilares(
                $data['question_text'],
                isset($data['subject_id']) ? (int) $data['subject_id'] : null,
                isset($data['topic_id']) ? (int) $data['topic_id'] : null,
                (int) ($data['limite'] ?? 10),
                $tenantId,
                $credencial,
                array_values(array_filter(array_map(fn ($o) => trim((string) ($o['option_text'] ?? '')), $data['options'] ?? []))),
                $data['disciplina'] ?? null,
                $data['assuntos'] ?? [],
                $data['image_url'] ?? null,
                array_map('intval', $data['ignorar_ids'] ?? []),
            );
        } catch (EmbeddingException $e) {
            return $this->error($e->getMessage(), ['code' => $e->codigo, 'verificacao' => 'indisponivel'], 503);
        }

        if ($soAlerta) {
            $busca['resultados'] = array_values(array_filter(
                $busca['resultados'],
                fn ($r) => in_array($r['tipo'], ['duplicata_exata', 'possivel_duplicata', 'muito_semelhante', 'comparacao_multimodal_necessaria'], true)
            ));
        }

        return $this->success($busca, 'Comparação concluída. Alta semelhança não impede o cadastro.');
    }

    private function authorizeStaff(Request $request): int
    {
        $this->examAccess->assertCanManageExams($request->user());

        return $this->requireTenantId($request);
    }
}
