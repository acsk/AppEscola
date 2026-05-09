<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSupportMaterialRequest;
use App\Http\Requests\UpdateSupportMaterialRequest;
use App\Http\Requests\UploadSupportMaterialFileRequest;
use App\Http\Resources\SupportMaterialResource;
use App\Models\Exam;
use App\Models\SupportMaterial;
use App\Services\TenantUploadSettingsService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use OpenApi\Attributes as OA;

class SupportMaterialController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/exams/{exam}/support-materials',
        tags: ['Support Materials'],
        summary: 'Listar materiais de apoio do simulado',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'exam', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Lista de materiais de apoio'),
            new OA\Response(response: 404, description: 'Simulado não encontrado'),
        ]
    )]
    public function index(Request $request, Exam $exam): AnonymousResourceCollection
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        $materials = $exam->supportMaterials()
            ->orderBy('created_at', 'desc')
            ->get();

        return SupportMaterialResource::collection($materials);
    }

    #[OA\Post(
        path: '/api/exams/{exam}/support-materials',
        tags: ['Support Materials'],
        summary: 'Criar material de apoio (link)',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'exam', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['title', 'type', 'content'],
                properties: [
                    new OA\Property(property: 'title', type: 'string', example: 'Vídeo explicativo'),
                    new OA\Property(property: 'description', type: 'string', example: 'Vídeo com explicação do conteúdo'),
                    new OA\Property(property: 'type', type: 'string', enum: ['link', 'file']),
                    new OA\Property(property: 'content', type: 'string', example: 'https://youtube.com/watch?v=...'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Material criado com sucesso'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreSupportMaterialRequest $request, Exam $exam): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        $data = $request->validated();
        $data['exam_id'] = $exam->id;
        $data['tenant_id'] = $exam->tenant_id;
        $data['created_by'] = $request->user()->id;

        $material = SupportMaterial::create($data);

        return response()->json(new SupportMaterialResource($material), 201);
    }

    #[OA\Get(
        path: '/api/exams/{exam}/support-materials/{material}',
        tags: ['Support Materials'],
        summary: 'Exibir material de apoio',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'exam', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'material', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Dados do material'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, Exam $exam, SupportMaterial $material): SupportMaterialResource
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        if ($material->exam_id !== $exam->id) {
            abort(404);
        }

        return new SupportMaterialResource($material);
    }

    #[OA\Put(
        path: '/api/exams/{exam}/support-materials/{material}',
        tags: ['Support Materials'],
        summary: 'Atualizar material de apoio',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'exam', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'material', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent()),
        responses: [
            new OA\Response(response: 200, description: 'Material atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateSupportMaterialRequest $request, Exam $exam, SupportMaterial $material): SupportMaterialResource
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        if ($material->exam_id !== $exam->id) {
            abort(404);
        }

        $data = $request->validated();
        $data['updated_by'] = $request->user()->id;

        $material->update($data);

        return new SupportMaterialResource($material);
    }

    #[OA\Delete(
        path: '/api/exams/{exam}/support-materials/{material}',
        tags: ['Support Materials'],
        summary: 'Remover material de apoio',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'exam', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'material', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, Exam $exam, SupportMaterial $material): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        if ($material->exam_id !== $exam->id) {
            abort(404);
        }

        $material->delete();

        return response()->json(['message' => 'Material removido com sucesso.']);
    }

    #[OA\Post(
        path: '/api/exams/{exam}/support-materials/upload',
        tags: ['Support Materials'],
        summary: 'Upload de arquivo para material de apoio',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'exam', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\MediaType(
                mediaType: 'multipart/form-data',
                schema: new OA\Schema(
                    required: ['title', 'file'],
                    properties: [
                        new OA\Property(property: 'title', type: 'string', description: 'Título do material'),
                        new OA\Property(property: 'description', type: 'string', description: 'Descrição opcional'),
                        new OA\Property(
                            property: 'file',
                            type: 'string',
                            format: 'binary',
                            description: 'Arquivo (PDF, imagem ou vídeo) - máx 50MB'
                        ),
                    ]
                )
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Arquivo enviado com sucesso'),
            new OA\Response(response: 422, description: 'Arquivo inválido'),
        ]
    )]
    public function uploadFile(
        UploadSupportMaterialFileRequest $request,
        Exam $exam,
        TenantUploadSettingsService $uploadSettings
    ): JsonResponse {
        $this->authorizeTenant($request, $exam->tenant_id);

        $data = $request->validated();
        $file = $request->file('file');

        // Determinar tipo de arquivo
        $mimeType = $file->getMimeType();
        $extension = $file->getClientOriginalExtension();

        if (str_starts_with($mimeType, 'video/')) {
            $fileType = 'video';
        } elseif ($extension === 'pdf') {
            $fileType = 'pdf';
        } elseif (str_starts_with($mimeType, 'image/')) {
            $fileType = 'image';
        } else {
            $fileType = 'document';
        }

        $directoryConfig = $uploadSettings->buildSupportMaterialDirectory($exam->tenant_id, $exam->id);
        $path = $file->store($directoryConfig['directory'], $directoryConfig['disk']);
        $contentUrl = $uploadSettings->url($directoryConfig['disk'], $path);

        $material = SupportMaterial::create([
            'tenant_id'   => $exam->tenant_id,
            'exam_id'     => $exam->id,
            'title'       => $data['title'],
            'description' => $data['description'] ?? null,
            'type'        => 'file',
            'content'     => $contentUrl,
            'file_type'   => $fileType,
            'file_size'   => $file->getSize(),
            'created_by'  => $request->user()->id,
        ]);

        return response()->json(new SupportMaterialResource($material), 201);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
