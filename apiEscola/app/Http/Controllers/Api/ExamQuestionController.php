<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreExamQuestionRequest;
use App\Http\Requests\UpdateExamQuestionRequest;
use App\Http\Resources\ExamQuestionResource;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\ExamQuestionOption;
use App\Services\ExamAccessService;
use App\Services\TenantUploadSettingsService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ExamQuestionController extends Controller
{
    use ScopedByTenant;

    /** Lista todas as questões de um simulado */
    public function index(Request $request, Exam $exam): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);
        app(ExamAccessService::class)->assertCanManageExams($request->user());

        $questions = $exam->questions()->with(['subject', 'options'])->get();

        return $this->success(ExamQuestionResource::collection($questions));
    }

    /** Adiciona uma questão ao simulado */
    #[OA\Post(
        path: '/api/exams/{exam}/questions/upload-image',
        tags: ['ExamQuestions'],
        summary: 'Upload de imagem do enunciado da questão',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'exam', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\MediaType(
                mediaType: 'multipart/form-data',
                schema: new OA\Schema(
                    required: ['image'],
                    properties: [
                        new OA\Property(property: 'question_id', type: 'integer', nullable: true, description: 'ID da questão quando o upload for feito para uma questão já existente.'),
                        new OA\Property(property: 'image', type: 'string', format: 'binary'),
                    ]
                )
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Imagem enviada com sucesso'),
            new OA\Response(response: 422, description: 'Arquivo inválido'),
        ]
    )]
    public function uploadImage(Request $request, Exam $exam, TenantUploadSettingsService $uploadSettings): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);
        app(ExamAccessService::class)->assertCanManageExams($request->user());

        $request->validate([
            'question_id' => [
                'nullable',
                'integer',
                Rule::exists('exam_questions', 'id')->where(fn ($query) => $query->where('exam_id', $exam->id)),
            ],
            'image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:5120'],
        ]);

        $tenant = $exam->tenant()->firstOrFail();
        $questionSegment = $request->integer('question_id') ?: 'draft';
        $directoryConfig = $uploadSettings->buildExamQuestionDirectory($tenant, $exam->id, $questionSegment);
        $path = $request->file('image')->store($directoryConfig['directory'], $directoryConfig['disk']);

        return response()->json([
            'message' => 'Imagem enviada com sucesso.',
            'image_url' => $uploadSettings->url($directoryConfig['disk'], $path),
            'path' => $path,
        ], 201);
    }

    #[OA\Post(
        path: '/api/exams/{exam}/questions',
        tags: ['ExamQuestions'],
        summary: 'Adicionar questão ao simulado',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'exam', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['type'],
                properties: [
                    new OA\Property(property: 'subject_id', type: 'integer', nullable: true),
                    new OA\Property(property: 'type', type: 'string', enum: ['multiple_choice', 'essay']),
                    new OA\Property(property: 'question_text', type: 'string', nullable: true, description: 'Enunciado em texto (opcional quando image_url for informado).'),
                    new OA\Property(property: 'image_url', type: 'string', nullable: true, format: 'uri', description: 'Imagem do enunciado (opcional quando question_text for informado).'),
                    new OA\Property(property: 'video_url', type: 'string', nullable: true, format: 'uri'),
                    new OA\Property(property: 'points', type: 'number', format: 'float', example: 1),
                    new OA\Property(property: 'order', type: 'integer', example: 1),
                    new OA\Property(property: 'explanation', type: 'string', nullable: true),
                    new OA\Property(property: 'allow_text_answer', type: 'boolean', example: false),
                    new OA\Property(
                        property: 'options',
                        type: 'array',
                        nullable: true,
                        items: new OA\Items(
                            properties: [
                                new OA\Property(property: 'option_text', type: 'string'),
                                new OA\Property(property: 'is_correct', type: 'boolean'),
                                new OA\Property(property: 'triggers_text_input', type: 'boolean', nullable: true),
                                new OA\Property(property: 'order', type: 'integer', nullable: true),
                            ]
                        )
                    ),
                ],
                description: 'Regra do enunciado: informe question_text, image_url ou ambos.'
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Questão criada'),
            new OA\Response(response: 422, description: 'Dados inválidos (ex.: sem texto e sem imagem)'),
        ]
    )]
    public function store(StoreExamQuestionRequest $request, Exam $exam): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);
        app(ExamAccessService::class)->assertCanManageExams($request->user());

        $tenantId = $this->getTenantId($request) ?? $exam->tenant_id;

        $question = DB::transaction(function () use ($request, $exam, $tenantId) {
            $nextOrder = $exam->questions()->max('order') + 1;

            $question = ExamQuestion::create([
                'tenant_id'         => $tenantId,
                'exam_id'           => $exam->id,
                'subject_id'        => $request->subject_id,
                'type'              => $request->type,
                'question_text'     => $request->question_text,
                'image_url'         => $request->image_url,
                'video_url'         => $request->video_url,
                'points'            => $request->points ?? 1.00,
                'order'             => $request->order ?? $nextOrder,
                'explanation'       => $request->explanation,
                'allow_text_answer' => $request->allow_text_answer ?? false,
            ]);

            if ($request->type === 'multiple_choice' && $request->options) {
                foreach ($request->options as $i => $opt) {
                    ExamQuestionOption::create([
                        'question_id'        => $question->id,
                        'option_text'        => $opt['option_text'],
                        'is_correct'         => $opt['is_correct'],
                        'order'              => $opt['order'] ?? ($i + 1),
                        'triggers_text_input' => $opt['triggers_text_input'] ?? false,
                    ]);
                }
            }

            return $question;
        });

        $question->load(['subject', 'options']);

        return $this->created(new ExamQuestionResource($question));
    }

    public function show(Request $request, Exam $exam, ExamQuestion $question): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);
        app(ExamAccessService::class)->assertCanManageExams($request->user());

        $question->load(['subject', 'options']);

        return $this->success(new ExamQuestionResource($question));
    }

    /** Atualiza questão e recria as opções se enviadas */
    #[OA\Put(
        path: '/api/exams/{exam}/questions/{question}',
        tags: ['ExamQuestions'],
        summary: 'Atualizar questão do simulado',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'exam', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'question', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'subject_id', type: 'integer', nullable: true),
                    new OA\Property(property: 'type', type: 'string', enum: ['multiple_choice', 'essay']),
                    new OA\Property(property: 'question_text', type: 'string', nullable: true, description: 'Enunciado em texto (opcional quando image_url for informado).'),
                    new OA\Property(property: 'image_url', type: 'string', nullable: true, format: 'uri', description: 'Imagem do enunciado (opcional quando question_text for informado).'),
                    new OA\Property(property: 'video_url', type: 'string', nullable: true, format: 'uri'),
                    new OA\Property(property: 'points', type: 'number', format: 'float', example: 1),
                    new OA\Property(property: 'order', type: 'integer', example: 1),
                    new OA\Property(property: 'explanation', type: 'string', nullable: true),
                    new OA\Property(property: 'allow_text_answer', type: 'boolean', example: false),
                ],
                description: 'Regra do enunciado: ao final da atualização, a questão precisa manter question_text, image_url ou ambos.'
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Questão atualizada'),
            new OA\Response(response: 422, description: 'Dados inválidos (ex.: sem texto e sem imagem)'),
        ]
    )]
    public function update(UpdateExamQuestionRequest $request, Exam $exam, ExamQuestion $question): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);
        app(ExamAccessService::class)->assertCanManageExams($request->user());

        DB::transaction(function () use ($request, $question) {
            $question->update($request->except('options'));

            if ($request->has('options') && $request->options !== null) {
                // Remove as antigas e recria
                $question->options()->delete();
                foreach ($request->options as $i => $opt) {
                    ExamQuestionOption::create([
                        'question_id'        => $question->id,
                        'option_text'        => $opt['option_text'],
                        'is_correct'         => $opt['is_correct'],
                        'order'              => $opt['order'] ?? ($i + 1),
                        'triggers_text_input' => $opt['triggers_text_input'] ?? false,
                    ]);
                }
            }
        });

        $question->load(['subject', 'options']);

        return $this->success(new ExamQuestionResource($question));
    }

    public function destroy(Request $request, Exam $exam, ExamQuestion $question): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);
        app(ExamAccessService::class)->assertCanManageExams($request->user());

        $question->options()->delete();
        $question->delete();

        return response()->json(['message' => 'Questão removida com sucesso.']);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);
        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
