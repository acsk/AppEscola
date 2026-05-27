<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreStudentRequest;
use App\Http\Requests\UpdateStudentRequest;
use App\Http\Resources\StudentResource;
use App\Models\Guardian;
use App\Models\Student;
use App\Services\StudentAppAccessService;
use App\Services\TenantUploadSettingsService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class StudentController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/students',
        tags: ['Students'],
        summary: 'Listar alunos',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'search', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'is_minor', in: 'query', required: false, schema: new OA\Schema(type: 'boolean')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de alunos'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Student::query()->with(['guardians', 'desiredCourses']);
        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('search'), function ($q, $v) {
                $q->where(function ($inner) use ($v) {
                    $inner->where('name', 'like', "%{$v}%")
                        ->orWhere('enrollment_number', 'like', "%{$v}%")
                        ->orWhere('document', 'like', "%{$v}%");
                });
            })
            ->when($request->query('is_minor'), fn ($q, $v) => $q->where('is_minor', filter_var($v, FILTER_VALIDATE_BOOLEAN)));

        $perPage = min(max((int) $request->query('per_page', 20), 1), 50);

        return StudentResource::collection($query->orderBy('name')->paginate($perPage));
    }

    #[OA\Post(
        path: '/api/students',
        tags: ['Students'],
        summary: 'Criar aluno (com responsáveis opcionais)',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['name'],
                properties: [
                    new OA\Property(property: 'name', type: 'string', example: 'João da Silva'),
                    new OA\Property(property: 'birth_date', type: 'string', format: 'date'),
                    new OA\Property(property: 'document', type: 'string', example: '123.456.789-00'),
                    new OA\Property(property: 'email', type: 'string', format: 'email'),
                    new OA\Property(property: 'phone', type: 'string'),
                    new OA\Property(property: 'is_minor', type: 'boolean'),
                    new OA\Property(property: 'status', type: 'string', example: 'active'),
                    new OA\Property(
                        property: 'guardians',
                        type: 'array',
                        description: 'Lista de responsáveis. Use guardian_id para vincular existente ou informe os dados para criar um novo.',
                        items: new OA\Items(
                            properties: [
                                new OA\Property(property: 'guardian_id', type: 'integer', description: 'ID de um responsável já cadastrado (opcional)'),
                                new OA\Property(property: 'name', type: 'string', description: 'Obrigatório se guardian_id não for informado'),
                                new OA\Property(property: 'document', type: 'string'),
                                new OA\Property(property: 'email', type: 'string', format: 'email'),
                                new OA\Property(property: 'phone', type: 'string'),
                                new OA\Property(property: 'relationship', type: 'string', example: 'mother'),
                                new OA\Property(property: 'is_financial_responsible', type: 'boolean', example: true),
                                new OA\Property(property: 'is_pedagogical_responsible', type: 'boolean'),
                                new OA\Property(property: 'can_access_portal', type: 'boolean'),
                            ]
                        )
                    ),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Aluno criado com responsáveis vinculados'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreStudentRequest $request, StudentAppAccessService $appAccess): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $student = DB::transaction(function () use ($request, $tenantId, $appAccess) {
            $studentData = collect($request->validated())
                ->except('guardians')
                ->merge(['tenant_id' => $tenantId])
                ->toArray();

            $student = Student::create($studentData);
            $appAccess->provision($student);

            if ($request->has('guardians')) {
                $this->syncGuardians($student, $request->input('guardians', []), $tenantId);
            }

            return $student->fresh();
        });

        $student->load('guardians');

        return $this->created(new StudentResource($student));
    }

    #[OA\Get(
        path: '/api/students/{id}',
        tags: ['Students'],
        summary: 'Exibir aluno',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados do aluno'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, Student $student): JsonResponse
    {
        $this->authorizeTenant($request, $student->tenant_id);

        $student->load(['guardians', 'desiredCourses']);

        return $this->success(new StudentResource($student));
    }

    #[OA\Put(
        path: '/api/students/{id}',
        tags: ['Students'],
        summary: 'Atualizar aluno',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Aluno atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateStudentRequest $request, Student $student): JsonResponse
    {
        $this->authorizeTenant($request, $student->tenant_id);

        DB::transaction(function () use ($request, $student) {
            $studentData = collect($request->validated())->except('guardians')->toArray();
            $student->update($studentData);

            if ($request->has('guardians')) {
                $tenantId = $this->getTenantId($request) ?? $student->tenant_id;
                $this->syncGuardians($student, $request->input('guardians', []), $tenantId);
            }
        });

        $student->load(['guardians', 'desiredCourses']);

        return $this->success(new StudentResource($student));
    }

    #[OA\Delete(
        path: '/api/students/{id}',
        tags: ['Students'],
        summary: 'Remover aluno',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, Student $student): JsonResponse
    {
        $this->authorizeTenant($request, $student->tenant_id);

        $student->delete();

        return response()->json(['message' => 'Aluno removido com sucesso.']);
    }

    #[OA\Post(
        path: '/api/students/{student}/upload-photo',
        tags: ['Students'],
        summary: 'Upload da foto do aluno',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'student', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\MediaType(
                mediaType: 'multipart/form-data',
                schema: new OA\Schema(
                    required: ['photo'],
                    properties: [
                        new OA\Property(property: 'photo', type: 'string', format: 'binary'),
                    ]
                )
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Foto enviada com sucesso'),
            new OA\Response(response: 422, description: 'Arquivo inválido'),
        ]
    )]
    public function uploadPhoto(Request $request, Student $student, TenantUploadSettingsService $uploadSettings): JsonResponse
    {
        $this->authorizeTenant($request, $student->tenant_id);

        $request->validate([
            'photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $tenant = $student->tenant()->firstOrFail();
        $directoryConfig = $uploadSettings->buildStudentPhotoDirectory($tenant, $student->id);
        $path = $request->file('photo')->store($directoryConfig['directory'], $directoryConfig['disk']);
        $photoUrl = $uploadSettings->url($directoryConfig['disk'], $path);

        $student->update([
            'photo_url' => $photoUrl,
        ]);

        return $this->success([
            'student_id' => $student->id,
            'photo_url' => $photoUrl,
            'path' => $path,
        ], 'Foto enviada com sucesso.');
    }

    #[OA\Post(
        path: '/api/students/{student}/provision-app-access',
        tags: ['Students'],
        summary: 'Gerar usuário de acesso ao app para aluno sem login',
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Usuário criado; retorna matrícula e senha inicial'),
            new OA\Response(response: 422, description: 'Aluno já possui acesso ou conflito de e-mail'),
        ]
    )]
    public function provisionAppAccess(
        Request $request,
        Student $student,
        StudentAppAccessService $appAccess
    ): JsonResponse {
        $this->authorizeTenant($request, (int) $student->tenant_id);

        if ($appAccess->hasAppAccess($student)) {
            return $this->error('Este aluno já possui acesso ao app.', null, 422);
        }

        try {
            $result = DB::transaction(fn () => $appAccess->provision($student));
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        $student->refresh()->load('guardians');

        return $this->success([
            'student' => new StudentResource($student),
            'login' => $result['enrollment_number'],
            'initial_password' => $result['initial_password'],
        ], 'Acesso ao app criado com sucesso.');
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }

    /**
     * Cria ou vincula responsáveis ao aluno, sincronizando a lista inteira.
     * Itens com guardian_id -> vincula (e cria o guardião se ele vier com dados extras).
     * Itens sem guardian_id -> cria o guardião e vincula.
     */
    private function syncGuardians(Student $student, array $guardians, ?int $tenantId): void
    {
        $pivotData = [];

        foreach ($guardians as $item) {
            if (!empty($item['guardian_id'])) {
                // Vincula guardião já existente
                $guardianId = $item['guardian_id'];
            } else {
                $normalizedDocument = $this->normalizeDocument((string) ($item['document'] ?? ''));

                // Reaproveita responsável existente pelo CPF dentro do tenant.
                $guardian = null;
                if ($normalizedDocument !== '') {
                    $guardian = Guardian::withTrashed()
                        ->where('tenant_id', $tenantId)
                        ->where('document', $normalizedDocument)
                        ->first();
                }

                if ($guardian) {
                    if (method_exists($guardian, 'trashed') && $guardian->trashed()) {
                        $guardian->restore();
                    }

                    $guardian->update([
                        'name' => $item['name'] ?? $guardian->name,
                        'email' => $item['email'] ?? $guardian->email,
                        'phone' => $item['phone'] ?? $guardian->phone,
                        'relationship' => $item['relationship'] ?? $guardian->relationship,
                    ]);
                } else {
                    // Cria novo guardião no tenant.
                    $guardian = Guardian::create([
                        'tenant_id'    => $tenantId,
                        'name'         => $item['name'],
                        'document'     => $normalizedDocument !== '' ? $normalizedDocument : null,
                        'email'        => $item['email'] ?? null,
                        'phone'        => $item['phone'] ?? null,
                        'relationship' => $item['relationship'] ?? null,
                    ]);
                }

                $guardianId = $guardian->id;
            }

            $pivotData[$guardianId] = [
                'tenant_id'                  => $tenantId,
                'is_financial_responsible'   => (bool) ($item['is_financial_responsible'] ?? false),
                'is_pedagogical_responsible' => (bool) ($item['is_pedagogical_responsible'] ?? false),
                'can_access_portal'          => (bool) ($item['can_access_portal'] ?? true),
            ];
        }

        // Substitui toda a lista de vínculos
        $student->guardians()->sync($pivotData);
    }

    private function normalizeDocument(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?? '';
    }
}
