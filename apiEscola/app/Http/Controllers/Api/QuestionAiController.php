<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionAiAutofillRequest;
use App\Http\Requests\QuestionAiSimilarRequest;
use App\Models\ExamQuestion;
use App\Services\Ai\AiCredentialResolver;
use App\Services\Ai\QuestionAiService;
use App\Services\ExamAccessService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * IA no banco de questões. Só sugere conteúdo — nada é gravado aqui;
 * o painel confirma e salva pelos endpoints normais de questão avulsa.
 */
class QuestionAiController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly AiCredentialResolver $resolver,
        private readonly QuestionAiService $ai,
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

    private function authorizeStaff(Request $request): int
    {
        $this->examAccess->assertCanManageExams($request->user());

        return $this->requireTenantId($request);
    }
}
