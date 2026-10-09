<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ExamAccessService;
use App\Services\PracticePerformanceService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Visão da escola sobre a prática dos alunos no banco de questões. */
class QuestionBankPracticeController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly PracticePerformanceService $performance,
    ) {}

    public function ranking(Request $request): JsonResponse
    {
        $this->examAccess->assertCanManageExams($request->user());
        $tenantId = $this->requireTenantId($request);
        $data = $request->validate([
            'period'     => ['nullable', Rule::in(PracticePerformanceService::PERIODS)],
            'limit'      => ['nullable', 'integer', 'min:1', 'max:200'],
            'criterion'  => ['nullable', Rule::in([
                PracticePerformanceService::CRITERION_PARTICIPATION,
                PracticePerformanceService::CRITERION_WILSON,
                PracticePerformanceService::CRITERION_DEDICATION,
            ])],
            'subject_id' => ['nullable', 'integer', Rule::exists('subjects', 'id')->where('tenant_id', $tenantId)],
            'topic_id'   => ['nullable', 'integer', Rule::exists('subject_topics', 'id')->where('tenant_id', $tenantId)],
            'page'       => ['nullable', 'integer', 'min:1'],
            'per_page'   => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $criterion = $data['criterion'] ?? PracticePerformanceService::CRITERION_PARTICIPATION;
        $scored = in_array($criterion, PracticePerformanceService::SCORED_CRITERIA, true);

        return $this->success($this->performance->ranking(
            $tenantId,
            $data['period'] ?? 'month',
            $scored ? (int) ($data['per_page'] ?? 50) : (int) ($data['limit'] ?? 50),
            fullNames: true,
            filters: [
                'criterion'  => $criterion,
                'subject_id' => $data['subject_id'] ?? null,
                'topic_id'   => $data['topic_id'] ?? null,
                'page'       => (int) ($data['page'] ?? 1),
            ],
        ));
    }
}
