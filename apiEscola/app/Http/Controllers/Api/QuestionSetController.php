<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GenerateQuestionSetRequest;
use App\Http\Requests\SaveQuestionSetRequest;
use App\Http\Resources\QuestionBankQuestionResource;
use App\Http\Resources\QuestionSetResource;
use App\Models\QuestionSet;
use App\Services\ExamAccessService;
use App\Services\QuestionClassificationService;
use App\Services\QuestionSetService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/** Simulados do banco de questões (painel): importados de PDF ou montados pelo admin. */
class QuestionSetController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly QuestionSetService $sets,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $tenantId = $this->authorizeStaff($request);
        $params = $request->validate([
            'status'   => ['nullable', Rule::in([QuestionSet::STATUS_DRAFT, QuestionSet::STATUS_PUBLISHED])],
            'origin'   => ['nullable', Rule::in([QuestionSet::ORIGIN_ADMIN, QuestionSet::ORIGIN_PDF_IMPORT])],
            'search'   => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        return QuestionSetResource::collection($this->sets->list($tenantId, $params));
    }

    public function store(SaveQuestionSetRequest $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $data = $request->validated();
        $set = $this->sets->create($tenantId, $data, $data['question_ids'] ?? [], $data['origin'] ?? QuestionSet::ORIGIN_ADMIN);

        return $this->created(new QuestionSetResource($set), "Simulado \"{$set->title}\" criado como rascunho.");
    }

    public function generate(GenerateQuestionSetRequest $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $data = $request->validated();
        $set = $this->sets->generate($tenantId, $data, $data);
        $message = $set->items_count < $data['quantity']
            ? "Simulado \"{$set->title}\" criado com {$set->items_count} questão(ões): não havia {$data['quantity']} com esses filtros."
            : "Simulado \"{$set->title}\" criado com {$set->items_count} questão(ões).";

        return $this->created(new QuestionSetResource($set), $message);
    }

    /** Detalhe com as questões na ordem; "practicable" indica se o aluno verá a questão. */
    public function show(Request $request, int $set): JsonResponse
    {
        $model = $this->findSet($request, $set);
        $questions = $model->questions()->with(array_merge(QuestionClassificationService::RELATIONS, ['options']))->get();

        return $this->success([
            'question_set' => new QuestionSetResource($model),
            'questions'    => $questions->map(fn ($question) => (new QuestionBankQuestionResource($question))->toArray($request) + [
                'practicable' => $question->isPracticable(),
            ])->values(),
        ]);
    }

    public function update(SaveQuestionSetRequest $request, int $set): JsonResponse
    {
        $model = $this->sets->update($this->findSet($request, $set), $request->validated());
        $message = match ($request->validated()['status'] ?? null) {
            QuestionSet::STATUS_PUBLISHED => "Simulado \"{$model->title}\" publicado para os alunos.",
            QuestionSet::STATUS_DRAFT     => "Simulado \"{$model->title}\" voltou para rascunho.",
            default                       => 'Simulado atualizado com sucesso.',
        };

        return $this->success(new QuestionSetResource($model), $message);
    }

    public function destroy(Request $request, int $set): JsonResponse
    {
        $model = $this->findSet($request, $set);
        $this->sets->delete($model);

        return $this->deleted("Simulado \"{$model->title}\" excluído. As questões continuam no banco.");
    }

    public function addQuestions(Request $request, int $set): JsonResponse
    {
        $model = $this->findSet($request, $set);
        $data = $request->validate([
            'question_ids'   => ['required', 'array', 'min:1', 'max:200'],
            'question_ids.*' => ['integer', 'distinct'],
        ], [], ['question_ids' => 'questões']);
        $model = $this->sets->append($model, $data['question_ids']);

        return $this->success(new QuestionSetResource($model), "Questões adicionadas ao simulado \"{$model->title}\".");
    }

    public function reorder(Request $request, int $set): JsonResponse
    {
        $model = $this->findSet($request, $set);
        $data = $request->validate([
            'question_ids'   => ['required', 'array', 'min:1', 'max:200'],
            'question_ids.*' => ['integer', 'distinct'],
        ], [], ['question_ids' => 'questões']);

        return $this->success(new QuestionSetResource($this->sets->reorder($model, $data['question_ids'])), 'Ordem das questões atualizada.');
    }

    public function removeQuestion(Request $request, int $set, int $question): JsonResponse
    {
        $model = $this->sets->removeQuestion($this->findSet($request, $set), $question);

        return $this->success(new QuestionSetResource($model), 'Questão removida do simulado. Ela continua no banco.');
    }

    private function authorizeStaff(Request $request): int
    {
        $this->examAccess->assertCanManageExams($request->user());

        return $this->requireTenantId($request);
    }

    private function findSet(Request $request, int $id): QuestionSet
    {
        $tenantId = $this->authorizeStaff($request);

        return QuestionSet::query()->where('tenant_id', $tenantId)
            ->with('examType:id,slug,label,logo_url')->withCount(['items', 'attempts'])
            ->findOrFail($id);
    }
}
