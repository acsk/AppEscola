<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\BatchQuestionClassificationRequest;
use App\Http\Requests\CreateExamFromQuestionsRequest;
use App\Http\Resources\ExamResource;
use App\Services\ExamFromQuestionsService;
use App\Http\Requests\SaveStandaloneQuestionRequest;
use App\Http\Requests\UpdateQuestionClassificationRequest;
use App\Http\Resources\QuestionBankQuestionResource;
use App\Models\ExamQuestion;
use App\Services\ExamAccessService;
use App\Services\QuestionBankQueryService;
use App\Services\QuestionClassificationService;
use App\Services\QuestionContentService;
use App\Services\TenantUploadSettingsService;
use App\Models\Tenant;
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
        private readonly QuestionContentService $content,
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

    /** Cria questão avulsa (sem simulado), com conteúdo e, opcionalmente, classificação. */
    public function store(SaveStandaloneQuestionRequest $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $question = $this->content->createStandalone($tenantId, $request->validated());
        $question->load('options');

        return $this->created(new QuestionBankQuestionResource($question), 'Questão criada com sucesso.');
    }

    /** Edita o conteúdo de questão avulsa (questão de simulado: 409, editar pelo simulado). */
    public function update(SaveStandaloneQuestionRequest $request, int $question): JsonResponse
    {
        $model = $this->content->updateStandalone($this->findQuestion($request, $question), $request->validated());
        $model->load('options');

        return $this->success(new QuestionBankQuestionResource($model), 'Questão atualizada com sucesso.');
    }

    public function destroy(Request $request, int $question): JsonResponse
    {
        $this->content->deleteStandalone($this->findQuestion($request, $question));

        return $this->deleted('Questão removida com sucesso.');
    }

    /** Cria um simulado (rascunho) com questões avulsas do banco, movidas na ordem enviada (importação de prova em PDF). */
    public function createExam(CreateExamFromQuestionsRequest $request, ExamFromQuestionsService $service): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $data = $request->validated();
        $exam = $service->create($tenantId, $data['title'], $data['exam_type'], $data['question_ids'], $data['description'] ?? null);

        return $this->created(new ExamResource($exam), "Simulado \"{$exam->title}\" criado como rascunho com {$exam->questions_count} questão(ões).");
    }

    /** Upload da imagem do enunciado de questão avulsa. */
    public function uploadImage(Request $request, TenantUploadSettingsService $uploadSettings): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $request->validate([
            'question_id' => ['nullable', 'integer'],
            'image'       => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:5120'],
        ]);

        $tenant = Tenant::findOrFail($tenantId);
        $directory = $uploadSettings->buildQuestionBankDirectory($tenant, $request->integer('question_id') ?: 'draft');
        $path = $request->file('image')->store($directory['directory'], $directory['disk']);

        return $this->created([
            'image_url' => $uploadSettings->url($directory['disk'], $path),
            'path'      => $path,
        ], 'Imagem enviada com sucesso.');
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
