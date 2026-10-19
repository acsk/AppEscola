<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ExamAccessService;
use App\Services\QuestionIssueReviewService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Configurações do banco de questões da escola (avisos de erro dos alunos). */
class QuestionBankSettingsController extends Controller
{
    use ScopedByTenant;

    public function __construct(private readonly ExamAccessService $examAccess) {}

    /** GET question-bank/settings */
    public function show(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);

        return $this->success($this->payload($tenantId), 'Configurações do banco de questões carregadas.');
    }

    /** PUT question-bank/settings */
    public function update(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $data = $request->validate([
            'issue_report_threshold' => ['required', 'integer', 'min:'.QuestionIssueReviewService::THRESHOLD_MIN, 'max:'.QuestionIssueReviewService::THRESHOLD_MAX],
        ], [], ['issue_report_threshold' => 'mínimo de alunos']);
        QuestionIssueReviewService::updateReportThreshold($tenantId, (int) $data['issue_report_threshold']);

        return $this->success($this->payload($tenantId), 'Configurações do banco de questões salvas com sucesso.');
    }

    private function payload(int $tenantId): array
    {
        return [
            'issue_report_threshold' => QuestionIssueReviewService::reportThreshold($tenantId),
            'issue_report_threshold_default' => (int) config('practice.issue_report_threshold', 3),
            'issue_report_threshold_min' => QuestionIssueReviewService::THRESHOLD_MIN,
            'issue_report_threshold_max' => QuestionIssueReviewService::THRESHOLD_MAX,
        ];
    }

    private function authorizeStaff(Request $request): int
    {
        $this->examAccess->assertCanManageExams($request->user());

        return $this->requireTenantId($request);
    }
}
