<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exam;
use App\Models\Subject;
use App\Services\ExamAccessService;
use App\Services\QuestionBankReleaseService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Liberação de assuntos do banco: pelo simulado oficial ou manualmente na disciplina. */
class QuestionBankReleaseController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly QuestionBankReleaseService $releases,
    ) {}

    /** GET exams/{exam}/question-bank-release */
    public function showExam(Request $request, Exam $exam): JsonResponse
    {
        $this->authorizeExam($request, $exam);

        return $this->success($this->releases->examPayload($exam), 'Assuntos do simulado carregados.');
    }

    /** PUT exams/{exam}/question-bank-release */
    public function updateExam(Request $request, Exam $exam): JsonResponse
    {
        $this->authorizeExam($request, $exam);
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'topic_ids' => ['required_if:enabled,true', 'array'],
            'topic_ids.*' => ['integer'],
        ], [
            'topic_ids.required_if' => 'Marque ao menos um assunto para liberar.',
        ], [
            'enabled' => 'liberação',
            'topic_ids' => 'assuntos',
        ]);

        $this->releases->syncExam($exam, $request->boolean('enabled'), $data['topic_ids'] ?? []);

        return $this->success(
            $this->releases->examPayload($exam),
            $request->boolean('enabled')
                ? 'Assuntos liberados no banco de questões.'
                : 'Este simulado não libera mais assuntos no banco.'
        );
    }

    /** GET question-bank/subjects/{subject}/topic-releases */
    public function showSubject(Request $request, Subject $subject): JsonResponse
    {
        $this->authorizeSubject($request, $subject);

        return $this->success($this->releases->subjectPayload($subject), 'Liberação de assuntos carregada.');
    }

    /** PUT question-bank/subjects/{subject}/topic-releases */
    public function updateSubject(Request $request, Subject $subject): JsonResponse
    {
        $this->authorizeSubject($request, $subject);
        $data = $request->validate([
            'course_id' => ['required', 'integer'],
            'topic_ids' => ['present', 'array'],
            'topic_ids.*' => ['integer'],
        ], [], [
            'course_id' => 'curso',
            'topic_ids' => 'assuntos',
        ]);

        $this->releases->syncManual($subject, (int) $data['course_id'], $data['topic_ids']);

        return $this->success($this->releases->subjectPayload($subject), 'Liberação de assuntos salva.');
    }

    private function authorizeExam(Request $request, Exam $exam): void
    {
        $this->examAccess->assertCanManageExams($request->user());
        $this->authorizeTenant($request, (int) $exam->tenant_id);
    }

    private function authorizeSubject(Request $request, Subject $subject): void
    {
        $this->examAccess->assertCanManageExams($request->user());
        $this->authorizeTenant($request, (int) $subject->tenant_id);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);
        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
