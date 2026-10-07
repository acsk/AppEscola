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
            'period' => ['nullable', Rule::in(PracticePerformanceService::PERIODS)],
            'limit'  => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        return $this->success($this->performance->ranking(
            $tenantId,
            $data['period'] ?? 'month',
            (int) ($data['limit'] ?? 50),
            fullNames: true,
        ));
    }
}
