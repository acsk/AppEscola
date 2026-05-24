<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PastExamResource;
use App\Models\PastExam;
use App\Models\Student;
use App\Services\StudentEnrollmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentPastExamController extends Controller
{
    public function __construct(
        private readonly StudentEnrollmentService $enrollmentService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        [$user, $student, $error] = $this->resolveAluno($request);
        if ($error) {
            return $error;
        }

        $courseIds = $this->enrollmentService->activeCourseIdsForStudent($student);

        $query = PastExam::query()
            ->with(['course:id,name', 'courses:id,name', 'subject:id,name,icon,color'])
            ->where('tenant_id', $user->tenant_id)
            ->where('type', 'file')
            ->where('file_type', 'pdf')
            ->published()
            ->visibleToStudentCourses($courseIds);

        $query
            ->when($request->query('search'), fn ($q, $v) => $q->where('title', 'like', "%{$v}%"))
            ->when($request->query('subject_id'), fn ($q, $v) => $q->where('subject_id', (int) $v))
            ->when($request->query('exam_year'), function ($q, $v) {
                $year = (int) $v;
                $q->where(function ($inner) use ($year) {
                    $inner->where('exam_year', $year)
                        ->orWhereYear('exam_date', $year);
                });
            })
            ->when($request->query('exam_type'), fn ($q, $v) => $q->where('exam_type', $v));

        $items = $query
            ->orderByDesc('sort_order')
            ->orderByDesc('exam_date')
            ->orderByDesc('exam_year')
            ->orderBy('title')
            ->get();

        return $this->success(
            PastExamResource::collection($items)->resolve($request),
            'Provas anteriores carregadas com sucesso.'
        );
    }

    public function show(Request $request, PastExam $pastExam): JsonResponse
    {
        [$user, $student, $error] = $this->resolveAluno($request);
        if ($error) {
            return $error;
        }

        if (
            (int) $pastExam->tenant_id !== (int) $user->tenant_id
            || ! $pastExam->is_published
            || $pastExam->type !== 'file'
            || $pastExam->file_type !== 'pdf'
        ) {
            return $this->notFound('Prova não disponível.');
        }

        $courseIds = $this->enrollmentService->activeCourseIdsForStudent($student);

        $pastExam->loadMissing('courses');
        $linkedCourseIds = $pastExam->linkedCourseIds();

        if ($linkedCourseIds->isNotEmpty() && $linkedCourseIds->intersect($courseIds)->isEmpty()) {
            return $this->forbidden('Você não possui acesso a esta prova.');
        }

        $pastExam->load(['course:id,name', 'courses:id,name', 'subject:id,name,icon,color']);

        return $this->success(new PastExamResource($pastExam));
    }

    /**
     * @return array{0: \App\Models\User, 1: Student, 2: JsonResponse|null}
     */
    private function resolveAluno(Request $request): array
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return [$user, new Student, $this->forbidden('Este endpoint é exclusivo para alunos.')];
        }

        $student = Student::query()
            ->where('user_id', $user->id)
            ->where('tenant_id', $user->tenant_id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return [$user, new Student, $this->forbidden('Aluno não encontrado ou inativo.')];
        }

        return [$user, $student, null];
    }
}
