<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\AiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionAiAutofillRequest;
use App\Http\Requests\QuestionAiExtractRequest;
use App\Http\Requests\QuestionAiPdfRequest;
use App\Http\Requests\QuestionAiSeparateTextRequest;
use App\Http\Requests\QuestionAiSimilarRequest;
use App\Http\Requests\RegenerateQuestionImageRequest;
use App\Models\ExamQuestion;
use App\Models\QuestionImageGeneration;
use App\Services\Ai\AiCredentialResolver;
use App\Services\Ai\QuestionAiService;
use App\Services\Ai\QuestionImageService;
use App\Services\ExamAccessService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * IA no banco de questões. Conteúdo só é salvo após confirmação pelo painel;
 * rascunhos e arquivos de imagem são persistidos para revisão e auditoria.
 */
class QuestionAiController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly AiCredentialResolver $resolver,
        private readonly QuestionAiService $ai,
        private readonly QuestionImageService $images,
    ) {}

    /** GET /question-bank/ai/status — se há chave disponível para o usuário (sem expor a chave). */
    public function status(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);

        return $this->success($this->resolver->status($request->user(), $tenantId));
    }

    /** POST /question-bank/ai/autofill — sugere alternativas, gabarito, explicação e classificação. */
    public function autofill(QuestionAiAutofillRequest $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $suggestion = $this->ai->autofill($request->user(), $tenantId, $request->validated());

        return $this->success($suggestion, 'Campos sugeridos pela IA. Revise antes de salvar.');
    }

    /** POST /question-bank/ai/extract — estrutura questões a partir de blocos de texto de PDF (não salva). */
    public function extract(QuestionAiExtractRequest $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $questions = $this->ai->extract($request->user(), $tenantId, array_values($request->validated()['blocks']));

        return $this->success(['questions' => $questions], count($questions).' questão(ões) extraída(s). Revise antes de incluir.');
    }

    public function extractPdf(QuestionAiPdfRequest $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $questions = $this->ai->extractPdf($request->user(), $tenantId, $request->file('pdf')->getContent());

        return $this->success(['questions' => $questions], count($questions).' questão(ões) convertida(s) pela IA. Revise antes de incluir.');
    }

    public function separateText(QuestionAiSeparateTextRequest $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $questions = $this->ai->separateText(
            $request->user(), $tenantId, $request->validated('text'), $request->validated('source_exam_name'),
            array_map('intval', $request->validated('subject_ids') ?? []),
            $request->validated('focus_pages')
        );

        return $this->success(['questions' => $questions], count($questions).' questão(ões) separada(s) pela IA. Revise e anexe as imagens necessárias antes de incluir.');
    }

    /** POST /question-bank/questions/{question}/ai/similar — gera questões semelhantes (não salva). */
    public function similar(QuestionAiSimilarRequest $request, int $question): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $source = ExamQuestion::query()->inQuestionBank($tenantId)->findOrFail($question);

        $questions = $this->ai->similar($request->user(), $tenantId, $source, $request->validated());

        return $this->success(
            ['questions' => $questions],
            count($questions).' questão(ões) gerada(s). Revise antes de incluir.'
        );
    }

    public function regenerateImage(RegenerateQuestionImageRequest $request, string $generation): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $draft = QuestionImageGeneration::query()->where('tenant_id', $tenantId)->findOrFail($generation);
        if ($draft->image_spec === null || $draft->content === null) {
            throw new AiException('Esta geração não possui um rascunho de imagem para regenerar.');
        }
        $lock = Cache::lock('question-image:'.$draft->id, 1800);
        if (! $lock->get()) {
            throw new AiException('Esta imagem já está sendo regenerada. Aguarde a conclusão.', 409, 'image_busy');
        }
        try {
            $payload = $this->images->regenerate(
                $request->user(), $draft, $request->validated('content'),
                (string) $request->validated('instructions', '')
            );
        } finally {
            $lock->release();
        }

        return $this->success($payload, $payload['image_generation']['status'] === 'READY'
            ? 'Imagem regenerada. Revise antes de aprovar.'
            : 'A imagem precisa de revisão. Confira o motivo antes de tentar novamente.');
    }

    private function authorizeStaff(Request $request): int
    {
        $this->examAccess->assertCanManageExams($request->user());

        return $this->requireTenantId($request);
    }
}
