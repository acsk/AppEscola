<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePastExamRequest;
use App\Http\Requests\UpdatePastExamRequest;
use App\Http\Requests\UploadPastExamFileRequest;
use App\Http\Resources\PastExamResource;
use App\Models\PastExam;
use App\Services\PastExamService;
use App\Services\TenantUploadSettingsService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class PastExamController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly PastExamService $pastExamService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->denyUnlessStaff($request);

        $query = PastExam::with(['course:id,name', 'subject:id,name,icon,color']);
        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('search'), fn ($q, $v) => $q->where('title', 'like', "%{$v}%"))
            ->when($request->query('course_id'), fn ($q, $v) => $q->where('course_id', $v))
            ->when($request->query('subject_id'), fn ($q, $v) => $q->where('subject_id', $v))
            ->when($request->has('is_published'), fn ($q) => $q->where('is_published', $request->boolean('is_published')))
            ->when($request->query('exam_year'), fn ($q, $v) => $q->where('exam_year', $v))
            ->when($request->query('exam_type'), fn ($q, $v) => $q->where('exam_type', $v));

        return PastExamResource::collection(
            $query->orderByDesc('sort_order')->orderByDesc('exam_year')->orderBy('title')->paginate(20)
        );
    }

    public function store(StorePastExamRequest $request): JsonResponse
    {
        $this->denyUnlessStaff($request);
        $tenantId = $this->requireTenantId($request);

        $data = $this->pastExamService->validateRelations($request->validated(), $tenantId);
        $data['tenant_id'] = $tenantId;
        $data['created_by'] = $request->user()->id;
        $data['is_published'] = (bool) ($data['is_published'] ?? false);

        $pastExam = PastExam::create($data);
        $pastExam->load(['course:id,name', 'subject:id,name,icon,color']);

        return $this->created(new PastExamResource($pastExam), 'Prova anterior cadastrada com sucesso.');
    }

    public function show(Request $request, PastExam $pastExam): JsonResponse
    {
        $this->denyUnlessStaff($request);
        $this->pastExamService->assertBelongsToTenant($pastExam, $this->requireTenantId($request));

        $pastExam->load(['course:id,name', 'subject:id,name,icon,color']);

        return $this->success(new PastExamResource($pastExam));
    }

    public function update(UpdatePastExamRequest $request, PastExam $pastExam): JsonResponse
    {
        $this->denyUnlessStaff($request);
        $tenantId = $this->requireTenantId($request);
        $this->pastExamService->assertBelongsToTenant($pastExam, $tenantId);

        $data = $request->validated();
        if ($data !== []) {
            $data = $this->pastExamService->validateRelations($data, $tenantId);
            $data['updated_by'] = $request->user()->id;
            $pastExam->update($data);
        }

        $pastExam->load(['course:id,name', 'subject:id,name,icon,color']);

        return $this->success(new PastExamResource($pastExam), 'Prova anterior atualizada com sucesso.');
    }

    public function destroy(Request $request, PastExam $pastExam): JsonResponse
    {
        $this->denyUnlessStaff($request);
        $this->pastExamService->assertBelongsToTenant($pastExam, $this->requireTenantId($request));

        $pastExam->delete();

        return $this->deleted('Prova anterior removida com sucesso.');
    }

    public function uploadFile(
        UploadPastExamFileRequest $request,
        TenantUploadSettingsService $uploadSettings,
    ): JsonResponse {
        $this->denyUnlessStaff($request);
        $tenantId = $this->requireTenantId($request);

        $data = $this->pastExamService->validateRelations($request->validated(), $tenantId);
        $file = $request->file('file');

        $directoryConfig = $uploadSettings->buildPastExamDirectory($tenantId);
        $path = $file->store($directoryConfig['directory'], $directoryConfig['disk']);
        $contentUrl = $uploadSettings->url($directoryConfig['disk'], $path);

        $pastExam = PastExam::create([
            'tenant_id'    => $tenantId,
            'title'        => $data['title'],
            'description'  => $data['description'] ?? null,
            'exam_year'    => $data['exam_year'] ?? null,
            'exam_type'    => $data['exam_type'] ?? null,
            'course_id'    => $data['course_id'] ?? null,
            'subject_id'   => $data['subject_id'] ?? null,
            'type'         => 'file',
            'content'      => $contentUrl,
            'file_type'    => 'pdf',
            'file_size'    => $file->getSize(),
            'is_published' => (bool) ($data['is_published'] ?? false),
            'sort_order'   => $data['sort_order'] ?? 0,
            'created_by'   => $request->user()->id,
        ]);

        $pastExam->load(['course:id,name', 'subject:id,name,icon,color']);

        return $this->created(new PastExamResource($pastExam), 'Arquivo enviado com sucesso.');
    }

    private function denyUnlessStaff(Request $request): void
    {
        $role = $request->user()?->role;

        if (! in_array($role, ['admin', 'super_admin', 'secretaria', 'professor'], true)) {
            abort(403, 'Sem permissão para gerenciar provas anteriores.');
        }
    }

    private function requireTenantId(Request $request): int
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId === null) {
            abort(403, 'Tenant não identificado.');
        }

        return $tenantId;
    }
}
