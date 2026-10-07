<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\IncludeQuestionImportDraftRequest;
use App\Http\Requests\SaveQuestionImportDraftRequest;
use App\Http\Resources\QuestionBankQuestionResource;
use App\Models\QuestionImportDraft;
use App\Services\ExamAccessService;
use App\Services\QuestionContentService;
use App\Traits\ScopedByTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class QuestionImportDraftController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $access,
        private readonly QuestionContentService $content,
    ) {}

    private function scoped(Request $request): Builder
    {
        $this->access->assertCanManageExams($request->user());

        return QuestionImportDraft::query()->where('tenant_id', $this->requireTenantId($request))
            ->where('user_id', $request->user()->id);
    }

    public function index(Request $request): JsonResponse
    {
        $drafts = $this->scoped($request)->whereJsonLength('questions', '>', 0)
            ->latest('updated_at')->paginate(10);

        return $this->success([
            'items' => collect($drafts->items())->map(fn (QuestionImportDraft $draft) => [
                'id' => $draft->id, 'source_exam_name' => $draft->source_exam_name,
                'question_count' => count($draft->questions), 'updated_at' => $draft->updated_at->toISOString(),
            ]),
            'current_page' => $drafts->currentPage(), 'last_page' => $drafts->lastPage(),
        ]);
    }

    public function show(Request $request, string $draft): JsonResponse
    {
        return $this->success($this->scoped($request)->findOrFail($draft));
    }

    public function store(SaveQuestionImportDraftRequest $request): JsonResponse
    {
        $this->scoped($request);
        $draft = QuestionImportDraft::create($request->validated() + [
            'tenant_id' => $this->requireTenantId($request), 'user_id' => $request->user()->id, 'revision' => 1,
        ]);

        return $this->created($draft, 'Rascunho da importação salvo. Retome depois neste ou em outro dispositivo.');
    }

    public function update(SaveQuestionImportDraftRequest $request, string $draft): JsonResponse
    {
        return DB::transaction(function () use ($request, $draft) {
            $model = $this->scoped($request)->lockForUpdate()->findOrFail($draft);
            if ($model->revision !== $request->integer('revision')) {
                return $this->error('Este rascunho foi atualizado em outro dispositivo. Reabra a versão salva antes de continuar.', null, 409);
            }
            $model->fill($request->safe()->except('revision'));
            $model->revision++;
            $model->save();

            return $this->success($model, 'Rascunho da importação atualizado.');
        });
    }

    public function includeQuestion(IncludeQuestionImportDraftRequest $request, string $draft, string $key): JsonResponse
    {
        return DB::transaction(function () use ($request, $draft, $key) {
            $model = $this->scoped($request)->lockForUpdate()->findOrFail($draft);
            if ($model->revision !== $request->integer('revision')) {
                return $this->error('Este rascunho já foi atualizado. Reabra a versão salva para evitar questões duplicadas.', null, 409);
            }
            if (! in_array($key, array_column($model->questions, 'key'), true)) {
                return $this->error('Esta questão não está mais no rascunho.', null, 409);
            }
            $item = collect($model->questions)->firstWhere('key', $key);
            if ($item['needsImage'] && ! $request->filled('image_url')) {
                throw ValidationException::withMessages(['image_url' => 'Anexe manualmente a imagem necessária antes de incluir a questão.']);
            }
            $question = $this->content->createStandalone((int) $model->tenant_id, array_replace(
                $request->safe()->except('revision'), ['source_exam_name' => $model->source_exam_name]
            ));
            // A criação e a retirada do rascunho são atômicas, inclusive em tentativas repetidas.
            $model->questions = array_values(array_filter($model->questions, fn (array $item) => $item['key'] !== $key));
            if (! in_array($model->active_question_key, array_column($model->questions, 'key'), true)) {
                $model->active_question_key = $model->questions[0]['key'] ?? null;
            }
            $model->revision++;
            $model->save();
            $question->load('options');

            return $this->created([
                'draft' => $model, 'question' => new QuestionBankQuestionResource($question),
            ], 'Questão incluída no banco e retirada do rascunho.');
        });
    }
}
