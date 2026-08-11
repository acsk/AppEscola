<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExamRequest;
use App\Http\Requests\UpdateExamRequest;
use App\Http\Resources\ExamResource;
use App\Models\Exam;
use App\Models\ExamStatus;
use App\Services\ExamDeliveryReportService;
use App\Services\ExamTypeService;
use App\Services\ExamAttemptIntegrityService;
use App\Services\ExamAccessService;
use App\Services\ExamCourseService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ExamController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamCourseService $examCourseService,
        private readonly ExamTypeService $examTypeService,
        private readonly ExamDeliveryReportService $deliveryReportService,
        private readonly ExamAccessService $examAccess,
    ) {
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->examAccess->assertCanManageExams($request->user());

        $query = Exam::with(['course', 'courses', 'subject', 'examStatus', 'examType']);
        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('status'),     fn ($q, $v) => $q->whereHas('examStatus',  fn ($sq) => $sq->where('slug', $v)))
            ->when($request->query('exam_type'),  fn ($q, $v) => $q->whereHas('examType',    fn ($sq) => $sq->where('slug', $v)))
            ->when($request->query('course_id'), function ($q, $v) {
                $q->where(function ($inner) use ($v) {
                    $inner->where('course_id', $v)
                        ->orWhereHas('courses', fn ($c) => $c->where('courses.id', $v));
                });
            })
            ->when($request->query('subject_id'), fn ($q, $v) => $q->where('subject_id', $v))
            ->when($request->query('search'),     fn ($q, $v) => $q->where('title', 'like', "%{$v}%"));

        $paginator = $query->orderByDesc('created_at')->paginate(20);

        $this->appendAnsweredMetrics($paginator->getCollection());

        return ExamResource::collection($paginator);
    }

    public function store(StoreExamRequest $request): JsonResponse
    {
        $this->examAccess->assertCanManageExams($request->user());

        $tenantId = $this->getTenantId($request);

        $data = $request->validated();
        $courseIds = $data['course_ids'] ?? [];
        unset($data['course_ids'], $data['course_id']);

        $data['exam_status_id'] = ExamStatus::where('slug', $data['status'] ?? 'draft')->value('id');
        $data['exam_type_id']   = $this->examTypeService->resolveActiveBySlug($data['exam_type'])->id;
        unset($data['status'], $data['exam_type']);

        $exam = Exam::create(array_merge($data, ['tenant_id' => $tenantId]));
        $this->examCourseService->sync($exam, $courseIds, $tenantId);
        $exam->load(['course', 'courses', 'subject', 'examStatus', 'examType']);

        return $this->created(new ExamResource($exam));
    }

    public function show(Request $request, Exam $exam): JsonResponse
    {
        $this->examAccess->assertCanManageExams($request->user());
        $this->authorizeTenant($request, $exam->tenant_id);

        $exam->load(['course', 'courses', 'subject', 'examStatus', 'examType', 'questions.options', 'questions.subject', 'questions.examType']);

        return $this->success(new ExamResource($exam));
    }

    public function update(UpdateExamRequest $request, Exam $exam): JsonResponse
    {
        $this->examAccess->assertCanManageExams($request->user());
        $this->authorizeTenant($request, $exam->tenant_id);

        $data = $request->validated();
        $courseIds = array_key_exists('course_ids', $data) ? ($data['course_ids'] ?? []) : null;
        unset($data['course_ids'], $data['course_id']);

        if (isset($data['status'])) {
            $data['exam_status_id'] = ExamStatus::where('slug', $data['status'])->value('id');
            unset($data['status']);
        }
        if (isset($data['exam_type'])) {
            $data['exam_type_id'] = $this->examTypeService->resolveActiveBySlug($data['exam_type'])->id;
            unset($data['exam_type']);
        }

        $exam->update($data);

        if ($courseIds !== null) {
            $this->examCourseService->sync($exam, $courseIds, (int) $exam->tenant_id);
        }

        $exam->load(['course', 'courses', 'subject', 'examStatus', 'examType']);

        return $this->success(new ExamResource($exam));
    }

    public function destroy(Request $request, Exam $exam): JsonResponse
    {
        $this->examAccess->assertCanManageExams($request->user());
        $this->authorizeTenant($request, $exam->tenant_id);

        // Cascata: questões e opções são removidas via cascadeOnDelete na FK
        $exam->delete();

        return response()->json(['message' => 'Simulado removido com sucesso.']);
    }

    /** Relatório de entregas: alunos que finalizaram o simulado e pendentes. */
    public function deliveryReport(Request $request, Exam $exam): JsonResponse
    {
        $this->examAccess->assertCanManageExams($request->user());
        $this->authorizeTenant($request, $exam->tenant_id);

        return $this->success(
            $this->deliveryReportService->build($exam),
            'Relatório de entregas do simulado.'
        );
    }

    /** Estatísticas agregadas para gráficos: por questão, por matéria, por aluno */
    public function stats(Request $request, Exam $exam, ExamAttemptIntegrityService $integrity): JsonResponse
    {
        $this->examAccess->assertCanManageExams($request->user());
        $this->authorizeTenant($request, $exam->tenant_id);

        $tenantId = $this->getTenantId($request);
        $exam->load(['questions.subject']);

        $bestAttempts = $integrity->bestCompletedAttemptsForExam($exam->id, $tenantId);
        $totalAttempts = $bestAttempts->count();
        $avgScore = $totalAttempts > 0 ? $bestAttempts->avg('percentage') : null;
        $passingScore = $exam->passing_score ?? 0;
        $passCount = $bestAttempts->filter(
            fn ($a) => (float) $a->percentage >= (float) $passingScore
        )->count();

        $questionStats = $exam->questions->map(function ($question) {
            $answersQuery = $question->answers()
                ->whereHas('attempt', fn ($q) => $q->whereStatus('completed'));

            $totalAnswers = (clone $answersQuery)->whereNotNull('is_correct')->count();
            $correctCount = (clone $answersQuery)->where('is_correct', true)->count();
            $previewText = $question->question_text
                ? mb_substr($question->question_text, 0, 80) . (mb_strlen($question->question_text) > 80 ? '…' : '')
                : '[Enunciado em imagem]';

            return [
                'question_id'    => $question->id,
                'question_text'  => $previewText,
                'subject'        => $question->subject?->name,
                'correct_count'  => $correctCount,
                'total_answers'  => $totalAnswers,
                'hit_rate'       => $totalAnswers > 0
                    ? round(($correctCount / $totalAnswers) * 100, 1)
                    : null,
            ];
        });

        $subjectStats = $questionStats
            ->groupBy('subject')
            ->map(fn ($qs, $subject) => [
                'subject'      => $subject,
                'avg_hit_rate' => round($qs->avg('hit_rate'), 1),
                'questions'    => $qs->count(),
            ])->values();

        return response()->json([
            'exam_id'        => $exam->id,
            'total_attempts' => $totalAttempts,
            'avg_percentage' => $avgScore !== null ? round($avgScore, 1) : null,
            'pass_count'     => $passCount,
            'pass_rate'      => $totalAttempts > 0 ? round(($passCount / $totalAttempts) * 100, 1) : null,
            'by_question'    => $questionStats,
            'by_subject'     => $subjectStats,
        ]);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);
        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }

    private function appendAnsweredMetrics(Collection $exams): void
    {
        if ($exams->isEmpty()) {
            return;
        }

        $examIds = $exams->pluck('id')->map(fn ($id) => (int) $id)->values();

        $respondedByExam = DB::table('exam_attempts')
            ->select('exam_id', DB::raw('COUNT(DISTINCT student_id) as responded_count'))
            ->whereIn('exam_id', $examIds)
            ->whereNull('deleted_at')
            ->whereNotNull('finished_at')
            ->groupBy('exam_id')
            ->pluck('responded_count', 'exam_id');

        $tenantIds = $exams
            ->pluck('tenant_id')
            ->map(fn ($tenantId) => (int) $tenantId)
            ->unique()
            ->values();

        $courseIdsByExam = $exams->mapWithKeys(function (Exam $exam) {
            return [$exam->id => $exam->linkedCourseIds()->unique()->values()];
        });

        $allCourseIds = $courseIdsByExam->flatten()->unique()->values();

        $studentsByTenantCourse = [];

        if ($allCourseIds->isNotEmpty()) {
            $today = now()->toDateString();

            $fromEnrollment = DB::table('enrollments')
                ->leftJoin('course_plans', 'enrollments.course_plan_id', '=', 'course_plans.id')
                ->leftJoin('school_classes', 'enrollments.school_class_id', '=', 'school_classes.id')
                ->whereIn('enrollments.tenant_id', $tenantIds)
                ->where('enrollments.status', 'active')
                ->where('enrollments.start_date', '<=', $today)
                ->where(function ($q) use ($today) {
                    $q->whereNull('enrollments.end_date')
                        ->orWhere('enrollments.end_date', '>=', $today);
                })
                ->whereNull('enrollments.deleted_at')
                ->whereIn(DB::raw('COALESCE(course_plans.course_id, school_classes.course_id)'), $allCourseIds)
                ->selectRaw('enrollments.tenant_id, enrollments.student_id, COALESCE(course_plans.course_id, school_classes.course_id) as course_id')
                ->get();

            $fromPivot = DB::table('enrollment_school_classes')
                ->join('enrollments', 'enrollment_school_classes.enrollment_id', '=', 'enrollments.id')
                ->join('school_classes', 'enrollment_school_classes.school_class_id', '=', 'school_classes.id')
                ->whereIn('enrollments.tenant_id', $tenantIds)
                ->where('enrollments.status', 'active')
                ->where('enrollments.start_date', '<=', $today)
                ->where(function ($q) use ($today) {
                    $q->whereNull('enrollments.end_date')
                        ->orWhere('enrollments.end_date', '>=', $today);
                })
                ->whereNull('enrollments.deleted_at')
                ->whereIn('school_classes.course_id', $allCourseIds)
                ->select('enrollments.tenant_id', 'enrollments.student_id', 'school_classes.course_id')
                ->get();

            $activeStudentCourseRows = $fromEnrollment
                ->concat($fromPivot)
                ->map(function ($row) {
                    return [
                        'tenant_id' => (int) $row->tenant_id,
                        'course_id' => (int) $row->course_id,
                        'student_id' => (int) $row->student_id,
                    ];
                })
                ->unique(fn (array $row) => $row['tenant_id'] . '|' . $row['course_id'] . '|' . $row['student_id']);

            foreach ($activeStudentCourseRows as $row) {
                $key = $row['tenant_id'] . '|' . $row['course_id'];
                $studentsByTenantCourse[$key][$row['student_id']] = true;
            }
        }

        foreach ($exams as $exam) {
            $tenantId = (int) $exam->tenant_id;
            $courseIds = $courseIdsByExam->get($exam->id, collect());

            $eligibleStudents = [];

            foreach ($courseIds as $courseId) {
                $key = $tenantId . '|' . (int) $courseId;
                if (! isset($studentsByTenantCourse[$key])) {
                    continue;
                }

                foreach (array_keys($studentsByTenantCourse[$key]) as $studentId) {
                    $eligibleStudents[$studentId] = true;
                }
            }

            $eligibleStudentsCount = count($eligibleStudents);
            $respondedStudentsCount = (int) ($respondedByExam[$exam->id] ?? 0);
            $respondedStudentsPercentage = $eligibleStudentsCount > 0
                ? min(100, round(($respondedStudentsCount / $eligibleStudentsCount) * 100, 1))
                : 0.0;

            $exam->setAttribute('eligible_students_count', $eligibleStudentsCount);
            $exam->setAttribute('responded_students_count', $respondedStudentsCount);
            $exam->setAttribute('responded_students_percentage', $respondedStudentsPercentage);
        }
    }
}
