<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExamTypeRequest;
use App\Http\Requests\UpdateExamTypeRequest;
use App\Http\Resources\ExamTypeResource;
use App\Models\ExamType;
use App\Services\ExamTypeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class ExamTypeController extends Controller
{
    public function __construct(
        private readonly ExamTypeService $examTypeService,
    ) {}

    /** Lista tipos ativos para dropdowns (todos os usuários autenticados). */
    public function index(Request $request): JsonResponse
    {
        $types = ExamType::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('label')
            ->get(['id', 'slug', 'label', 'sort_order']);

        return response()->json($types);
    }

    /** Lista completa para gestão (super admin). */
    public function adminIndex(Request $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $types = ExamType::query()
            ->withCount(['exams', 'pastExams', 'questions'])
            ->orderBy('sort_order')
            ->orderBy('label')
            ->get();

        return $this->success(ExamTypeResource::collection($types));
    }

    public function store(StoreExamTypeRequest $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $data = $request->validated();
        $slug = $data['slug'] ?? $this->examTypeService->generateUniqueSlug($data['label']);

        $type = ExamType::create([
            'slug'       => $slug,
            'label'      => $data['label'],
            'sort_order' => $data['sort_order'] ?? 0,
            'is_active'  => (bool) ($data['is_active'] ?? true),
        ]);

        return $this->created(new ExamTypeResource($type), 'Classificação cadastrada com sucesso.');
    }

    public function update(UpdateExamTypeRequest $request, ExamType $examType): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $data = $request->validated();

        if (array_key_exists('label', $data) && ! array_key_exists('slug', $data)) {
            // Mantém slug estável ao renomear; SA pode enviar slug explicitamente se quiser alterar.
        }

        if (isset($data['slug']) && $data['slug'] === '') {
            unset($data['slug']);
        }

        $examType->update($data);

        return $this->success(new ExamTypeResource($examType->fresh()), 'Classificação atualizada com sucesso.');
    }

    public function destroy(Request $request, ExamType $examType): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $this->examTypeService->assertCanDelete($examType);
        $examType->delete();

        return $this->deleted('Classificação removida com sucesso.');
    }

    private function ensureSuperAdmin(Request $request): void
    {
        if (! $request->user()?->isSuperAdmin()) {
            throw new AccessDeniedHttpException('Acesso permitido apenas para super admin.');
        }
    }
}
