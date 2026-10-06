<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\BatchQuestionClassificationRequest;
use App\Http\Requests\UpdateQuestionClassificationRequest;
use App\Http\Resources\QuestionBankQuestionResource;
use App\Models\ExamQuestion;
use App\Services\ExamAccessService;
use App\Services\QuestionBankQueryService;
use App\Services\QuestionClassificationService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** Banco de questões: listagem (avulsas e de simulados) e classificação. */
class QuestionBankController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly QuestionBankQueryService $queries,
        private readonly QuestionClassificationService $classification,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $tenantId = $this->authorizeStaff($request);
        $result = $this->queries->paginate($tenantId, $request->query());

        return QuestionBankQuestionResource::collection($result['page'])
            ->additional(['meta' => ['tab_counts' => $result['tab_counts']]]);
    }

    /** Ids da listagem atual (mesmos filtros/aba/ordem), para "selecionar todas" e "Salvar e próxima". */
    public function ids(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $ids = $this->queries->ids($tenantId, $request->query());

        return $this->success([
            'ids'       => $ids,
            'truncated' => count($ids) >= QuestionBankQueryService::MAX_IDS,
        ]);
    }

    public function years(Request $request): JsonResponse
    {
        return $this->success($this->queries->years($this->authorizeStaff($request)));
    }

    public function show(Request $request, int $question): JsonResponse
    {
        $model = $this->findQuestion($request, $question);
        $model->load(array_merge(QuestionClassificationService::RELATIONS, ['options']));

        return $this->success(new QuestionBankQuestionResource($model));
    }

    public function updateClassification(UpdateQuestionClassificationRequest $request, int $question): JsonResponse
    {
        $model = $this->findQuestion($request, $question);
        $model = $this->classification->apply($model, $request->validated(), (int) $model->tenant_id);

        return $this->success(new QuestionBankQuestionResource($model), 'Classificação salva com sucesso.');
    }

    public function batchClassification(BatchQuestionClassificationRequest $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $results = $this->classification->applyBatch($request->validated()['items'], $tenantId);

        $failed = count(array_filter($results, fn ($r) => ! $r['ok']));
        $updated = count($results) - $failed;
        $message = $failed === 0
            ? "{$updated} questão(ões) atualizada(s)."
            : "{$updated} questão(ões) atualizada(s); {$failed} com erro.";

        return $this->success([
            'updated' => $updated,
            'failed'  => $failed,
            'results' => $results,
        ], $message);
    }

    private function authorizeStaff(Request $request): int
    {
        $this->examAccess->assertCanManageExams($request->user());

        return $this->requireTenantId($request);
    }

    private function findQuestion(Request $request, int $id): ExamQuestion
    {
        $tenantId = $this->authorizeStaff($request);

        return ExamQuestion::query()->inQuestionBank($tenantId)->findOrFail($id);
    }
}
