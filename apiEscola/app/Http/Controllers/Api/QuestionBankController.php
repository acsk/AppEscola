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
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\PracticeAnswer;
use App\Services\Ai\ValidadorQuestaoService;
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
        private readonly ValidadorQuestaoService $validador,
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

    /** GET question-bank/exam-options?search=&ids=1,2 — simulados oficiais com questões no banco (filtro). */
    public function examOptions(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'ids'    => ['nullable', 'string', 'max:255'],
        ]);

        return $this->success($this->queries->examOptions(
            $tenantId,
            trim((string) ($data['search'] ?? '')),
            QuestionBankQueryService::idList($data['ids'] ?? [])
        ));
    }

    public function show(Request $request, int $question): JsonResponse
    {
        $model = $this->findQuestion($request, $question);
        $model->load(array_merge(QuestionClassificationService::RELATIONS, ['options']));
        $model->loadCount('issueReports');

        return $this->success(new QuestionBankQuestionResource($model));
    }

    public function updateClassification(UpdateQuestionClassificationRequest $request, int $question): JsonResponse
    {
        $model = $this->findQuestion($request, $question);
        $model = $this->classification->apply($model, $request->validated(), (int) $model->tenant_id);

        return $this->success(new QuestionBankQuestionResource($model), 'Classificação salva com sucesso.');
    }

    /** POST question-bank/questions/revalidation — marca questões já revalidadas para não repetir. */
    public function markRevalidated(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:500'],
            'ids.*' => ['integer'],
            'revalidated' => ['required', 'boolean'],
        ]);

        $ids = ExamQuestion::query()->inQuestionBank($tenantId)->whereIn('id', $data['ids'])->pluck('id');
        ExamQuestion::query()->whereIn('id', $ids)->update([
            'revalidated_at' => $data['revalidated'] ? now() : null,
        ]);

        return $this->success([
            'ids' => $ids->map(fn ($id) => (int) $id)->all(),
            'revalidated' => (bool) $data['revalidated'],
        ], $data['revalidated'] ? 'Questões marcadas como revalidadas.' : 'Marca de revalidação removida.');
    }

    /** POST question-bank/questions/{question}/practice-reset — descarta a prática e a questão volta como nova. */
    public function resetPractice(Request $request, int $question): JsonResponse
    {
        $model = $this->findQuestion($request, $question);
        $removed = PracticeAnswer::query()->where('exam_question_id', $model->id)->delete();
        $model->forceFill(['practice_reset_at' => now()])->save();

        return $this->success([
            'id' => (int) $model->id,
            'removed_answers' => $removed,
            'practice_reset_at' => $model->practice_reset_at?->toIso8601String(),
        ], 'A questão voltou como nova. Os alunos respondem de novo.');
    }

    /** POST question-bank/questions/review/approve — aprovação manual das questões selecionadas. */
    public function approveReviews(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:500'],
            'ids.*' => ['integer'],
        ]);

        $ids = $this->validador->aprovarManualmenteEmLote($tenantId, $data['ids'], $request->user()?->id);
        $count = count($ids);

        return $this->success([
            'ids' => $ids,
        ], $count === 1 ? '1 questão aprovada manualmente.' : "{$count} questões aprovadas manualmente.");
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

    /** GET question-bank/imported-exams — simulados criados a partir de PDF (rascunho ou não). */
    public function importedExams(Request $request, ExamFromQuestionsService $service): AnonymousResourceCollection
    {
        $tenantId = $this->authorizeStaff($request);
        $data = $request->validate([
            'status'   => ['nullable', 'string', 'exists:exam_statuses,slug'],
            'search'   => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        return ExamResource::collection($service->listImported(
            $tenantId, $data['status'] ?? null, $data['search'] ?? null, (int) ($data['per_page'] ?? 15)
        ));
    }

    /** POST question-bank/imported-exams/{exam}/questions — acrescenta questões avulsas ao fim do simulado importado. */
    public function appendToImportedExam(Request $request, int $exam, ExamFromQuestionsService $service): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $data = $request->validate([
            'question_ids'   => ['required', 'array', 'min:1', 'max:120'],
            'question_ids.*' => ['integer', 'distinct'],
        ], [], ['question_ids' => 'questões']);
        $model = Exam::query()->where('tenant_id', $tenantId)
            ->where('origin', ExamFromQuestionsService::ORIGIN_PDF_IMPORT)->findOrFail($exam);
        $model = $service->append($model, $data['question_ids']);

        return $this->success(new ExamResource($model), count($data['question_ids'])." questão(ões) adicionada(s) ao simulado \"{$model->title}\".");
    }

    /** DELETE question-bank/imported-exams/{exam}?keep_questions=1 */
    public function destroyImportedExam(Request $request, int $exam, ExamFromQuestionsService $service): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $keep = $request->validate(['keep_questions' => ['sometimes', 'boolean']])['keep_questions'] ?? false;
        $model = Exam::query()->where('tenant_id', $tenantId)
            ->where('origin', ExamFromQuestionsService::ORIGIN_PDF_IMPORT)->findOrFail($exam);

        $detached = $service->delete($model, (bool) $keep);

        return $this->success(null, $keep
            ? "Simulado \"{$model->title}\" excluído. {$detached} questão(ões) voltaram ao banco como avulsas."
            : "Simulado \"{$model->title}\" excluído junto com as questões.");
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
