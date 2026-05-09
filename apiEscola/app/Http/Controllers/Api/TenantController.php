<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreTenantRequest;
use App\Http\Requests\UpdateTenantRequest;
use App\Http\Resources\TenantResource;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class TenantController extends Controller
{
    private function ensureSuperAdmin(Request $request): void
    {
        $user = $request->user();

        if (! $user || ! $user->isSuperAdmin()) {
            throw new AccessDeniedHttpException('Acesso permitido apenas para super admin.');
        }
    }

    #[OA\Get(
        path: '/api/tenants',
        tags: ['Tenants'],
        summary: 'Listar tenants',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'search', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de tenants'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->ensureSuperAdmin($request);

        $tenants = Tenant::query()
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('search'), fn ($q, $v) => $q->where('name', 'like', "%{$v}%"))
            ->orderBy('name')
            ->paginate(20);

        return TenantResource::collection($tenants);
    }

    #[OA\Post(
        path: '/api/tenants',
        tags: ['Tenants'],
        summary: 'Criar tenant',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados do tenant')),
        responses: [
            new OA\Response(response: 201, description: 'Tenant criado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreTenantRequest $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $data = $request->validated();

        $tenantData = [
            'corporate_name' => $data['corporate_name'],
            'trade_name'     => $data['trade_name'] ?? null,
            'name'           => $data['name'],
            'slug'           => $data['slug'],
            'cnpj'           => $data['cnpj'] ?? null,
            'email'          => $data['email'] ?? null,
            'phone'          => $data['phone'] ?? null,
            'whatsapp'       => $data['whatsapp'] ?? null,
            'zip_code'       => $data['zip_code'] ?? null,
            'street'         => $data['street'] ?? null,
            'number'         => $data['number'] ?? null,
            'complement'     => $data['complement'] ?? null,
            'neighborhood'   => $data['neighborhood'] ?? null,
            'city'           => $data['city'] ?? null,
            'state'          => $data['state'] ?? null,
            'status'         => $data['status'] ?? 'active',
            'settings'       => $data['settings'] ?? null,
        ];

        $tenant = DB::transaction(function () use ($tenantData, $data) {
            $tenant = Tenant::create($tenantData);

            User::create([
                'tenant_id'                 => $tenant->id,
                'is_tenant_owner'           => true,
                'name'                      => $data['admin_name'],
                'email'                     => $data['admin_email'],
                'password'                  => $data['admin_password'],
                'role'                      => 'admin',
                'status'                    => 'active',
                'password_change_required'  => true,
            ]);

            return $tenant;
        });

        return $this->created(new TenantResource($tenant));
    }

    #[OA\Get(
        path: '/api/tenants/{id}',
        tags: ['Tenants'],
        summary: 'Exibir tenant',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados do tenant'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, Tenant $tenant): TenantResource
    {
        $this->ensureSuperAdmin($request);

        return new TenantResource($tenant);
    }

    #[OA\Put(
        path: '/api/tenants/{id}',
        tags: ['Tenants'],
        summary: 'Atualizar tenant',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Tenant atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateTenantRequest $request, Tenant $tenant): TenantResource
    {
        $this->ensureSuperAdmin($request);

        $data = $request->validated();

        $tenantData = collect($data)->except([
            'admin_password',
            'admin_password_confirmation',
            'admin_password_change_required',
        ])->all();

        DB::transaction(function () use ($tenant, $tenantData, $data) {
            if (! empty($tenantData)) {
                $tenant->update($tenantData);
            }

            $updateAdmin = array_key_exists('admin_password', $data)
                || array_key_exists('admin_password_change_required', $data);

            if (! $updateAdmin) {
                return;
            }

            $admin = $tenant->users()
                ->where('role', 'admin')
                ->orderBy('id')
                ->first();

            if (! $admin) {
                throw ValidationException::withMessages([
                    'admin_password' => ['Nenhum usuário admin encontrado para este tenant.'],
                ]);
            }

            $adminData = [];

            if (array_key_exists('admin_password', $data)) {
                $adminData['password'] = $data['admin_password'];
            }

            if (array_key_exists('admin_password_change_required', $data)) {
                $adminData['password_change_required'] = (bool) $data['admin_password_change_required'];
            }

            if (! empty($adminData)) {
                $admin->update($adminData);
            }
        });

        return new TenantResource($tenant->fresh());
    }

    #[OA\Delete(
        path: '/api/tenants/{id}',
        tags: ['Tenants'],
        summary: 'Remover tenant',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, Tenant $tenant): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $tenant->delete();

        return response()->json(['message' => 'Tenant removido com sucesso.']);
    }

    #[OA\Post(
        path: '/api/tenants/{tenant}/upload-photo',
        tags: ['Tenants'],
        summary: 'Upload de foto do tenant',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'tenant', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\MediaType(
                mediaType: 'multipart/form-data',
                schema: new OA\Schema(
                    required: ['photo'],
                    properties: [
                        new OA\Property(
                            property: 'photo',
                            type: 'string',
                            format: 'binary',
                            description: 'Arquivo de imagem (jpg, jpeg, png, webp) - máx 5MB'
                        ),
                    ]
                )
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Foto enviada com sucesso'),
            new OA\Response(response: 422, description: 'Arquivo inválido'),
        ]
    )]
    public function uploadPhoto(Request $request, Tenant $tenant, \App\Services\TenantUploadSettingsService $uploadSettings): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $request->validate([
            'photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $directoryConfig = $uploadSettings->buildTenantPhotoDirectory($tenant);
        $path = $request->file('photo')->store($directoryConfig['directory'], $directoryConfig['disk']);
        $photoUrl = $uploadSettings->url($directoryConfig['disk'], $path);

        $tenant->update([
            'photo_url' => $photoUrl,
        ]);

        return response()->json([
            'tenant_id' => $tenant->id,
            'photo_url' => $photoUrl,
            'path' => $path,
            'message' => 'Foto enviada com sucesso.',
        ], 200);
    }
}
