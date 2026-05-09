<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClassScheduleController;
use App\Http\Controllers\Api\CourseBundleController;
use App\Http\Controllers\Api\CoursePlanController;
use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\DomainController;
use App\Http\Controllers\Api\EnrollmentController;
use App\Http\Controllers\Api\GuardianController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\SchoolClassController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\Api\StudentAttendanceController;
use App\Http\Controllers\Api\StudentGuardianController;
use App\Http\Controllers\Api\SubjectController;
use App\Http\Controllers\Api\ExamAttemptController;
use App\Http\Controllers\Api\ExamController;
use App\Http\Controllers\Api\ExamQuestionController;
use App\Http\Controllers\Api\StudentDashboardController;
use App\Http\Controllers\Api\StudentExamController;
use App\Http\Controllers\Api\TenantApiTokenController;
use App\Http\Controllers\Api\TenantController;
use App\Http\Controllers\Api\UserManagementController;
use Illuminate\Support\Facades\Route;

// Autenticação (pública)
Route::post('/login', [AuthController::class, 'login']);

// Domínios / lookups (públicos — usados para popular dropdowns no frontend)
Route::prefix('domains')->group(function () {
    Route::get('statuses',               [DomainController::class, 'statuses']);
    Route::get('user-roles',             [DomainController::class, 'userRoles']);
    Route::get('periods',                [DomainController::class, 'periods']);
    Route::get('weekdays',               [DomainController::class, 'weekdays']);
    Route::get('guardian-relationships', [DomainController::class, 'guardianRelationships']);
    Route::get('payment-methods',        [DomainController::class, 'paymentMethods']);
    Route::get('enrollment-statuses',    [DomainController::class, 'enrollmentStatuses']);
    Route::get('invoice-statuses',       [DomainController::class, 'invoiceStatuses']);
    Route::get('billing-cycles',         [DomainController::class, 'billingCycles']);
    Route::get('invoice-types',          [DomainController::class, 'invoiceTypes']);
});

// Rotas autenticadas via Sanctum
Route::middleware(['auth:sanctum', \App\Http\Middleware\IdentifyTenant::class])->group(function () {

    // Auth
    Route::get('/me', [AuthController::class, 'me']);
    Route::match(['post', 'put', 'patch'], '/me/password', [AuthController::class, 'updatePassword']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Tenants (somente super_admin)
    Route::apiResource('tenants', TenantController::class);

    // Administração de usuários (super_admin e admin)
    Route::apiResource('users', UserManagementController::class);

    // Alunos
    Route::apiResource('students', StudentController::class);

    // Responsáveis de um aluno (nested)
    Route::prefix('students/{student}/guardians')->group(function () {
        Route::get('/', [StudentGuardianController::class, 'index']);
        Route::post('/', [StudentGuardianController::class, 'store']);
        Route::delete('/{guardian}', [StudentGuardianController::class, 'destroy']);
    });

    // Responsáveis
    Route::apiResource('guardians', GuardianController::class);

    // Cursos
    Route::apiResource('courses', CourseController::class);

    // Planos de curso (nested + standalone para update/delete)
    Route::get('courses/{course}/plans',    [CoursePlanController::class, 'index']);
    Route::post('courses/{course}/plans',   [CoursePlanController::class, 'store']);
    Route::get('course-plans/{plan}',       [CoursePlanController::class, 'show']);
    Route::put('course-plans/{plan}',       [CoursePlanController::class, 'update']);
    Route::delete('course-plans/{plan}',    [CoursePlanController::class, 'destroy']);

    // Pacotes de cursos (bundles)
    Route::apiResource('course-bundles', CourseBundleController::class);

    // Disciplinas
    Route::apiResource('subjects', SubjectController::class);

    // Turmas
    Route::apiResource('school-classes', SchoolClassController::class);

    // Horários por turma (nested)
    Route::prefix('school-classes/{schoolClass}/schedules')->group(function () {
        Route::get('/', [ClassScheduleController::class, 'index']);
        Route::post('/', [ClassScheduleController::class, 'store']);
    });

    // Frequencia de alunos por turma e dia (lancamento em lote)
    Route::prefix('school-classes/{schoolClass}/attendances')->group(function () {
        Route::get('/', [StudentAttendanceController::class, 'index']);
        Route::post('/', [StudentAttendanceController::class, 'store']);
    });

    // Horários (update/delete direto)
    Route::put('class-schedules/{classSchedule}', [ClassScheduleController::class, 'update']);
    Route::delete('class-schedules/{classSchedule}', [ClassScheduleController::class, 'destroy']);

    // Matrículas
    Route::post('enrollments/subscribe',        [EnrollmentController::class, 'subscribe']);
    Route::post('enrollments/subscribe-bundle', [EnrollmentController::class, 'subscribeBundle']);
    Route::apiResource('enrollments', EnrollmentController::class);

    // Cobranças
    Route::apiResource('invoices', InvoiceController::class);
    Route::post('invoices/{invoice}/mark-as-paid', [InvoiceController::class, 'markAsPaid']);
    Route::post('invoices/{invoice}/cancel', [InvoiceController::class, 'cancel']);

    // Tokens de API por tenant
    Route::get('tenant-api-tokens', [TenantApiTokenController::class, 'index']);
    Route::post('tenant-api-tokens', [TenantApiTokenController::class, 'store']);
    Route::delete('tenant-api-tokens/{tenantApiToken}', [TenantApiTokenController::class, 'destroy']);

    // Simulados do aluno autenticado (role: aluno)
    Route::get('aluno/dashboard',                [StudentDashboardController::class, 'index']);
    Route::get('aluno/exams',                    [StudentExamController::class, 'index']);
    Route::get('aluno/exams/{exam}',             [StudentExamController::class, 'show']);
    Route::get('aluno/attempts',                 [StudentExamController::class, 'attempts']);
    Route::get('aluno/attempts/{attempt}/review',[StudentExamController::class, 'reviewAttempt']);

    // Simulados
    Route::apiResource('exams', ExamController::class);
    Route::get('exams/{exam}/stats',   [ExamController::class, 'stats']);

    // Domínios de simulados (lookup tables — read-only)
    Route::get('exam-statuses', fn () => response()->json(\App\Models\ExamStatus::orderBy('order')->get(['id', 'slug', 'label'])));
    Route::get('exam-types',    fn () => response()->json(\App\Models\ExamType::get(['id', 'slug', 'label'])));

    // Questões de um simulado (nested)
    Route::get('exams/{exam}/questions',               [ExamQuestionController::class, 'index']);
    Route::post('exams/{exam}/questions',              [ExamQuestionController::class, 'store']);
    Route::get('exams/{exam}/questions/{question}',    [ExamQuestionController::class, 'show']);
    Route::put('exams/{exam}/questions/{question}',    [ExamQuestionController::class, 'update']);
    Route::delete('exams/{exam}/questions/{question}', [ExamQuestionController::class, 'destroy']);

    // Tentativas de simulado
    Route::get('exam-attempts/summary',                                  [ExamAttemptController::class, 'summary']);
    Route::get('exam-attempts',                                          [ExamAttemptController::class, 'index']);
    Route::post('exams/{exam}/start',                                    [ExamAttemptController::class, 'start']);
    Route::post('exam-attempts/{attempt}/answer',                        [ExamAttemptController::class, 'answer']);
    Route::post('exam-attempts/{attempt}/finish',                        [ExamAttemptController::class, 'finish']);
    Route::patch('exam-attempts/{attempt}/answers/{answer}/correct',     [ExamAttemptController::class, 'correctAnswer']);
    Route::get('exam-attempts/{attempt}',                                [ExamAttemptController::class, 'show']);
    Route::get('exams/{exam}/ranking',                                   [ExamAttemptController::class, 'ranking']);
});
