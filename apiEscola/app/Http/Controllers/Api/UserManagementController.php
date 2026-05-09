<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Subject;
use App\Models\User;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use OpenApi\Attributes as OA;

class UserManagementController extends Controller
{
    use ScopedByTenant;

    private function isTenantInitialUser(User $user): bool
    {
        if ($user->tenant_id === null) {
            return false;
        }

        if ((bool) $user->is_tenant_owner) {
            return true;
        }

        // Fallback para bases antigas: considera o primeiro usuário do tenant como admin inicial.
        return ! User::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', '<', $user->id)
            ->exists();
    }

    private function ensureCanManageUsers(Request $request): void
    {
        $user = $request->user();

        if (! $user || ! in_array($user->role, ['super_admin', 'admin'], true)) {
            abort(403, 'Acesso negado.');
        }
    }

    private function ensureCanManageTargetUser(Request $request, User $target): void
    {
        $actor = $request->user();

        if ($actor->isSuperAdmin()) {
            return;
        }

        if ((int) $actor->tenant_id !== (int) $target->tenant_id) {
            abort(403, 'Acesso negado.');
        }

        if ($target->role === 'super_admin') {
            abort(403, 'Acesso negado.');
        }
    }

    private function normalizeStoreData(Request $request, array $data): array
    {
        $actor = $request->user();

        if ($actor->isSuperAdmin()) {
            if (($data['role'] ?? null) === 'super_admin') {
                $data['tenant_id'] = null;
            } elseif (! array_key_exists('tenant_id', $data) || ! $data['tenant_id']) {
                throw ValidationException::withMessages([
                    'tenant_id' => ['tenant_id é obrigatório para usuários que não são super_admin.'],
                ]);
            }

            return $data;
        }

        if (($data['role'] ?? null) === 'super_admin') {
            throw ValidationException::withMessages([
                'role' => ['Admin do tenant não pode criar usuário com role super_admin.'],
            ]);
        }

        $data['tenant_id'] = $actor->tenant_id;

        return $data;
    }

    private function validateStore(Request $request): array
    {
        return $request->validate([
            'tenant_id'                 => ['nullable', 'integer', 'exists:tenants,id'],
            'name'                      => ['required', 'string', 'max:255'],
            'email'                     => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'password'                  => ['required', 'string', 'min:6', 'confirmed'],
            'role'                      => ['required', 'exists:domain_user_roles,slug'],
            'status'                    => ['nullable', 'exists:domain_statuses,slug'],
            'password_change_required'  => ['nullable', 'boolean'],
            'subject_ids'               => ['nullable', 'array'],
            'subject_ids.*'             => ['integer', 'exists:subjects,id'],
        ]);
    }

    private function validateUpdate(Request $request, User $target): array
    {
        return $request->validate([
            'tenant_id'                 => ['sometimes', 'nullable', 'integer', 'exists:tenants,id'],
            'name'                      => ['sometimes', 'string', 'max:255'],
            'email'                     => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($target->id)],
            'password'                  => ['sometimes', 'string', 'min:6', 'confirmed'],
            'role'                      => ['sometimes', 'exists:domain_user_roles,slug'],
            'status'                    => ['sometimes', 'exists:domain_statuses,slug'],
            'password_change_required'  => ['sometimes', 'boolean'],
            'subject_ids'               => ['sometimes', 'array'],
            'subject_ids.*'             => ['integer', 'exists:subjects,id'],
        ]);
    }

    private function syncProfessorSubjects(User $user, array $data): void
    {
        $hasSubjectIds = array_key_exists('subject_ids', $data);

        if ($user->role !== 'professor') {
            // Garante consistência: apenas professor pode manter vínculos de disciplinas.
            $user->subjects()->detach();

            if ($hasSubjectIds && ! empty($data['subject_ids'])) {
                throw ValidationException::withMessages([
                    'subject_ids' => ['A associação de disciplinas é permitida apenas para usuários com role professor.'],
                ]);
            }

            return;
        }

        if (! $hasSubjectIds) {
            return;
        }

        $subjectIds = collect($data['subject_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values();

        if ($subjectIds->isEmpty()) {
            $user->subjects()->detach();

            return;
        }

        $tenantId = (int) $user->tenant_id;

        if (! $tenantId) {
            throw ValidationException::withMessages([
                'tenant_id' => ['Professor deve estar associado a um tenant para vincular disciplinas.'],
            ]);
        }

        $validCount = Subject::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $subjectIds)
            ->count();

        if ($validCount !== $subjectIds->count()) {
            throw ValidationException::withMessages([
                'subject_ids' => ['Uma ou mais disciplinas não pertencem ao tenant do professor.'],
            ]);
        }

        $syncData = [];

        foreach ($subjectIds as $subjectId) {
            $syncData[$subjectId] = ['tenant_id' => $tenantId];
        }

        $user->subjects()->sync($syncData);
    }

    private function normalizeUpdateData(Request $request, User $target, array $data): array
    {
        $actor = $request->user();

        if (
            $this->isTenantInitialUser($target)
            && array_key_exists('role', $data)
            && $data['role'] !== $target->role
        ) {
            throw ValidationException::withMessages([
                'role' => ['O usuário administrador inicial do tenant não pode ter o perfil alterado.'],
            ]);
        }

        if (! $actor->isSuperAdmin()) {
            unset($data['tenant_id']);

            if (($data['role'] ?? null) === 'super_admin') {
                throw ValidationException::withMessages([
                    'role' => ['Admin do tenant não pode promover usuário para super_admin.'],
                ]);
            }
        }

        $nextRole = $data['role'] ?? $target->role;
        $nextTenantId = array_key_exists('tenant_id', $data) ? $data['tenant_id'] : $target->tenant_id;

        if ($nextRole === 'super_admin') {
            $data['tenant_id'] = null;
        } elseif (! $nextTenantId) {
            throw ValidationException::withMessages([
                'tenant_id' => ['tenant_id é obrigatório para usuários que não são super_admin.'],
            ]);
        }

        return $data;
    }

    #[OA\Get(
        path: '/api/users',
        tags: ['Users'],
        summary: 'Listar usuários (super_admin: todos; admin: apenas do próprio tenant)',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'tenant_id', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'role', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'search', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de usuários'),
            new OA\Response(response: 403, description: 'Acesso negado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->ensureCanManageUsers($request);

        $query = User::query()->with('subjects:id,name,status');

        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('role'), fn ($q, $v) => $q->where('role', $v))
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('search'), function ($q, $v) {
                $q->where(function ($sub) use ($v) {
                    $sub->where('name', 'like', "%{$v}%")
                        ->orWhere('email', 'like', "%{$v}%");
                });
            });

        if (! $request->user()->isSuperAdmin()) {
            $query->where('role', '!=', 'super_admin');
        }

        return UserResource::collection($query->orderBy('name')->paginate(20));
    }

    #[OA\Post(
        path: '/api/users',
        tags: ['Users'],
        summary: 'Criar usuário',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados do usuário')),
        responses: [
            new OA\Response(response: 201, description: 'Usuário criado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
            new OA\Response(response: 403, description: 'Acesso negado'),
        ]
    )]
    public function store(Request $request): JsonResponse
    {
        $this->ensureCanManageUsers($request);

        $validated = $this->validateStore($request);
        $data = $this->normalizeStoreData($request, $validated);

        $user = DB::transaction(function () use ($data) {
            $user = User::create([
                'tenant_id'                => $data['tenant_id'] ?? null,
                'name'                     => $data['name'],
                'email'                    => $data['email'],
                'password'                 => $data['password'],
                'role'                     => $data['role'],
                'status'                   => $data['status'] ?? 'active',
                'password_change_required' => (bool) ($data['password_change_required'] ?? false),
            ]);

            $this->syncProfessorSubjects($user, $data);

            return $user;
        });

        return $this->created(new UserResource($user->load('subjects:id,name,status')));
    }

    #[OA\Get(
        path: '/api/users/{id}',
        tags: ['Users'],
        summary: 'Exibir usuário',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados do usuário'),
            new OA\Response(response: 403, description: 'Acesso negado'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, User $user): JsonResponse
    {
        $this->ensureCanManageUsers($request);
        $this->ensureCanManageTargetUser($request, $user);

        return $this->success(new UserResource($user->load('subjects:id,name,status')));
    }

    #[OA\Put(
        path: '/api/users/{id}',
        tags: ['Users'],
        summary: 'Atualizar usuário',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Usuário atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
            new OA\Response(response: 403, description: 'Acesso negado'),
        ]
    )]
    public function update(Request $request, User $user): JsonResponse
    {
        $this->ensureCanManageUsers($request);
        $this->ensureCanManageTargetUser($request, $user);

        $validated = $this->validateUpdate($request, $user);
        $data = $this->normalizeUpdateData($request, $user, $validated);

        DB::transaction(function () use ($user, $data) {
            $user->update($data);
            $this->syncProfessorSubjects($user, $data);
        });

        return $this->success(new UserResource($user->fresh()->load('subjects:id,name,status')));
    }

    #[OA\Delete(
        path: '/api/users/{id}',
        tags: ['Users'],
        summary: 'Remover usuário',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 403, description: 'Acesso negado'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->ensureCanManageUsers($request);
        $this->ensureCanManageTargetUser($request, $user);

        if ((int) $request->user()->id === (int) $user->id) {
            throw ValidationException::withMessages([
                'user' => ['Não é permitido remover o próprio usuário autenticado.'],
            ]);
        }

        if ($this->isTenantInitialUser($user)) {
            throw ValidationException::withMessages([
                'user' => ['O usuário administrador inicial do tenant não pode ser removido.'],
            ]);
        }

        $user->delete();

        return response()->json(['message' => 'Usuário removido com sucesso.']);
    }
}
