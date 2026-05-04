<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ExamResource;
use App\Models\Exam;
use App\Models\ExamAttempt;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StudentExamController extends Controller
{
    /**
     * Lista os simulados disponíveis para o aluno autenticado.
     *
     * Critérios:
     *  - Usuário deve ter role 'aluno'
     *  - Deve existir um Student vinculado ao user_id com status 'active'
     *  - O aluno deve ter ao menos uma matrícula ativa (status = 'active',
     *    start_date <= hoje, end_date >= hoje ou nulo)
     *  - Apenas simulados publicados (exam_status.slug = 'published')
     *  - Apenas simulados do(s) curso(s) da matrícula ativa
     *  - Simulados cujo prazo ainda não encerrou (ends_at >= agora ou nulo)
     *
     * Cada item da resposta inclui o campo `attempt_status` com o status
     * da tentativa do aluno ('not_started' | 'in_progress' | 'completed').
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return $this->forbidden('Este endpoint é exclusivo para alunos.');
        }

        // Localizar o student vinculado ao usuário
        $student = Student::where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return $this->forbidden('Aluno não encontrado ou inativo.');
        }

        // Matrículas ativas dentro do período vigente
        $today = now()->toDateString();

        $courseIds = DB::table('enrollments')
            ->join('course_plans', 'enrollments.course_plan_id', '=', 'course_plans.id')
            ->where('enrollments.student_id', $student->id)
            ->where('enrollments.status', 'active')
            ->where('enrollments.start_date', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('enrollments.end_date')
                  ->orWhere('enrollments.end_date', '>=', $today);
            })
            ->whereNull('enrollments.deleted_at')
            ->pluck('course_plans.course_id')
            ->unique()
            ->values();

        if ($courseIds->isEmpty()) {
            return $this->success([], 'Nenhuma matrícula ativa encontrada.');
        }

        $now = now();

        $exams = Exam::with(['course', 'subject', 'examStatus', 'examType'])
            ->where('tenant_id', $user->tenant_id)
            ->whereIn('course_id', $courseIds)
            ->whereHas('examStatus', fn ($q) => $q->where('slug', 'published'))
            ->where(function ($q) use ($now) {
                $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now);
            })
            ->orderBy('starts_at')
            ->get();

        // Enriquecer com status da tentativa do aluno
        $attemptStatuses = ExamAttempt::where('student_id', $student->id)
            ->whereIn('exam_id', $exams->pluck('id'))
            ->get(['exam_id', 'status'])
            ->keyBy('exam_id');

        $result = $exams->map(function (Exam $exam) use ($attemptStatuses) {
            $resource = (new ExamResource($exam))->resolve(request());
            $attempt  = $attemptStatuses->get($exam->id);

            $resource['attempt_status'] = $attempt?->status ?? 'not_started';
            $resource['can_start']      = $this->canStart($exam);

            return $resource;
        });

        return $this->success($result, 'Simulados disponíveis.');
    }

    /**
     * Exibe detalhes de um simulado específico para o aluno, incluindo as questões.
     * Aplica os mesmos critérios de elegibilidade do `index`.
     */
    public function show(Request $request, Exam $exam): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return $this->forbidden('Este endpoint é exclusivo para alunos.');
        }

        $student = Student::where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return $this->forbidden('Aluno não encontrado ou inativo.');
        }

        if (! $exam->isPublished()) {
            return $this->notFound('Simulado não disponível.');
        }

        if ($exam->tenant_id !== $user->tenant_id) {
            return $this->forbidden();
        }

        // Verificar se o aluno tem matrícula ativa no curso do simulado
        $today = now()->toDateString();

        $hasEnrollment = DB::table('enrollments')
            ->join('course_plans', 'enrollments.course_plan_id', '=', 'course_plans.id')
            ->where('enrollments.student_id', $student->id)
            ->where('course_plans.course_id', $exam->course_id)
            ->where('enrollments.status', 'active')
            ->where('enrollments.start_date', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('enrollments.end_date')
                  ->orWhere('enrollments.end_date', '>=', $today);
            })
            ->whereNull('enrollments.deleted_at')
            ->exists();

        if (! $hasEnrollment) {
            return $this->forbidden('Você não possui matrícula ativa neste curso.');
        }

        $exam->load(['course', 'subject', 'examStatus', 'examType', 'questions.options', 'questions.subject']);

        $attempt = ExamAttempt::where('exam_id', $exam->id)
            ->where('student_id', $student->id)
            ->latest('started_at')
            ->first();

        $resource                   = (new ExamResource($exam))->resolve($request);
        $resource['attempt_status'] = $attempt?->status ?? 'not_started';
        $resource['attempt_id']     = $attempt?->id;
        $resource['can_start']      = $this->canStart($exam);

        return $this->success($resource);
    }

    /**
     * Verifica se o simulado ainda pode ser iniciado
     * (starts_at <= agora <= ends_at, ou sem datas definidas).
     */
    private function canStart(Exam $exam): bool
    {
        $now = now();

        if ($exam->starts_at && $exam->starts_at->gt($now)) {
            return false;
        }

        if ($exam->ends_at && $exam->ends_at->lt($now)) {
            return false;
        }

        return true;
    }
}
