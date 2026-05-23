<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamAttempt;
use App\Models\Student;
use App\Models\User;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class ExamAccessService
{
    /** Papéis que podem ver gabarito e gerenciar simulados no painel. */
    public const STAFF_ROLES = ['super_admin', 'admin', 'secretaria', 'professor'];

    public function __construct(
        private readonly StudentEnrollmentService $enrollmentService,
    ) {
    }

    public static function canViewAnswerKeys(?User $user): bool
    {
        return $user !== null && in_array($user->role, self::STAFF_ROLES, true);
    }

    public function isStaff(User $user): bool
    {
        return self::canViewAnswerKeys($user);
    }

    public function resolveActiveStudent(User $user): ?Student
    {
        if ($user->role !== 'aluno') {
            return null;
        }

        return Student::query()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();
    }

    public function assertCanManageExams(User $user): void
    {
        if (! $this->isStaff($user)) {
            throw new AccessDeniedHttpException('Sem permissão para gerenciar simulados.');
        }
    }

    public function assertTenantMatch(Request $request, ?int $resourceTenantId): void
    {
        $user = $request->user();

        if (! $user || $user->isSuperAdmin()) {
            return;
        }

        if ($resourceTenantId === null || (int) $user->tenant_id !== (int) $resourceTenantId) {
            throw new AccessDeniedHttpException('Acesso negado.');
        }
    }

    /**
     * Aluno: apenas a própria tentativa. Staff: tentativas do tenant.
     */
    public function authorizeAttemptView(Request $request, ExamAttempt $attempt): ?Student
    {
        $user = $request->user();

        if (! $user) {
            throw new AccessDeniedHttpException('Não autenticado.');
        }

        $this->assertTenantMatch($request, $attempt->tenant_id);

        if ($user->role === 'aluno') {
            $student = $this->resolveActiveStudent($user);

            if (! $student || (int) $attempt->student_id !== (int) $student->id) {
                throw new AccessDeniedHttpException('Você não possui acesso a esta tentativa.');
            }

            return $student;
        }

        if (! $this->isStaff($user)) {
            throw new AccessDeniedHttpException('Sem permissão para visualizar esta tentativa.');
        }

        return null;
    }

    /**
     * Apenas o aluno dono da tentativa pode responder ou finalizar.
     */
    public function authorizeAttemptAnswer(Request $request, ExamAttempt $attempt): Student
    {
        $user = $request->user();

        if (! $user || $user->role !== 'aluno') {
            throw new AccessDeniedHttpException('Apenas alunos podem enviar respostas nesta tentativa.');
        }

        $this->assertTenantMatch($request, $attempt->tenant_id);

        $student = $this->resolveActiveStudent($user);

        if (! $student) {
            throw new AccessDeniedHttpException('Aluno não encontrado ou inativo.');
        }

        if ((int) $attempt->student_id !== (int) $student->id) {
            throw new AccessDeniedHttpException('Você não possui acesso a esta tentativa.');
        }

        return $student;
    }

    public function authorizeStaff(Request $request): void
    {
        $user = $request->user();

        if (! $user || ! $this->isStaff($user)) {
            throw new AccessDeniedHttpException('Sem permissão para esta operação.');
        }
    }

    public function assertActiveEnrollmentForExam(Student $student, Exam $exam): void
    {
        if (! $this->hasActiveEnrollmentForExam($student, $exam)) {
            throw new AccessDeniedHttpException('Você não possui matrícula ativa neste curso.');
        }
    }

    public function hasActiveEnrollmentForExam(Student $student, Exam $exam): bool
    {
        $exam->loadMissing('courses');
        $courseIds = $exam->linkedCourseIds();

        if ($courseIds->isEmpty()) {
            return true;
        }

        foreach ($courseIds as $courseId) {
            if ($this->enrollmentService->hasActiveEnrollmentInCourse($student, $courseId)) {
                return true;
            }
        }

        return false;
    }
}
