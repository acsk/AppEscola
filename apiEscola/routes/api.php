<?php

use App\Http\Controllers\Api\AdminDashboardController;
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
use App\Http\Controllers\Api\StudentFinanceController;
use App\Http\Controllers\Api\StudentAttendanceController;
use App\Http\Controllers\Api\StudentGuardianController;
use App\Http\Controllers\Api\SubjectController;
use App\Http\Controllers\Api\ExamAttemptController;
use App\Http\Controllers\Api\ExamController;
use App\Http\Controllers\Api\ExamQuestionController;
use App\Http\Controllers\Api\SupportMaterialController;
use App\Http\Controllers\Api\StudentDashboardController;
use App\Http\Controllers\Api\StudentExamController;
use App\Http\Controllers\Api\StudentPerformanceController;
use App\Http\Controllers\Api\TenantApiTokenController;
use App\Http\Controllers\Api\TenantBillingSettingsController;
use App\Http\Controllers\Api\TenantCoraSettingsController;
use App\Http\Controllers\Api\TenantController;
use App\Http\Controllers\Api\TenantUploadSettingsController;
use App\Http\Controllers\Api\AppVersionController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\PaymentProviderController;
use App\Http\Controllers\Api\PaymentProvidersController;
use App\Http\Controllers\Api\PublicRegistrationController;
use App\Http\Controllers\Api\ReceiptController;
use App\Http\Controllers\Api\UserManagementController;
use App\Http\Controllers\Api\NotificationBroadcastController;
use App\Http\Controllers\Api\TenantMobileThemeController;
use App\Http\Controllers\Api\TenantNotificationSettingsController;
use App\Http\Controllers\Api\StudentNotificationController;
use App\Http\Controllers\Api\CalendarEventController;
use App\Http\Controllers\Api\StudentCalendarController;
use Illuminate\Support\Facades\Route;

// Health check (público)
Route::get('/health', [HealthController::class, 'check']);

// Autenticação (pública)
Route::post('/login', [AuthController::class, 'login']);

// Cadastro público (mobile — sem autenticação, com throttle anti-abuso)
Route::prefix('public/{tenant_slug}')
    ->middleware('throttle:30,1')
    ->group(function () {
        Route::get('/courses',  [PublicRegistrationController::class, 'courses']);
        Route::post('/register', [PublicRegistrationController::class, 'register']);
    });

// Versões dos apps (público — atualizado a cada build)
Route::get('/version/panel',   [AppVersionController::class, 'panel']);
Route::get('/version/mobile',  [AppVersionController::class, 'mobile']);
Route::post('/version/panel',  [AppVersionController::class, 'updatePanel']);
Route::post('/version/mobile', [AppVersionController::class, 'updateMobile']);

// Metadados da API (público)
Route::get('/meta', function () {
    return response()->json([
        'type' => 'success',
        'message' => 'Metadados da API carregados com sucesso.',
        'body' => [
            'api_version' => (string) config('api_meta.version', '1.0.0'),
            'contract_version' => (string) config('api_meta.contract_version', date('Y-m-d')),
            'has_breaking_changes' => (bool) config('api_meta.has_breaking_changes', false),
            'force_relogin' => (bool) config('api_meta.force_relogin', false),
            'min_supported_app_version' => (string) config('api_meta.min_supported_app_version', '1.0.0'),
            'recommended_app_version' => (string) config('api_meta.recommended_app_version', '1.0.0'),
            'changelog_url' => (string) config('api_meta.changelog_url', ''),
            'server_time' => now()->toISOString(),
        ],
    ]);
});

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
    Route::get('/dashboard', [AdminDashboardController::class, 'show']);
    Route::match(['post', 'put', 'patch'], '/me/password', [AuthController::class, 'updatePassword']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Tenants (somente super_admin)
    Route::apiResource('tenants', TenantController::class);
    Route::get('tenants/{tenant}/upload-settings', [TenantUploadSettingsController::class, 'show']);
    Route::put('tenants/{tenant}/upload-settings', [TenantUploadSettingsController::class, 'update']);
    Route::post('tenants/{tenant}/upload-photo', [TenantController::class, 'uploadPhoto']);
    Route::get('tenants/{tenant}/cora-settings', [TenantCoraSettingsController::class, 'show']);
    Route::post('tenants/{tenant}/cora-settings/upload', [TenantCoraSettingsController::class, 'upload']);
    Route::post('tenants/{tenant}/cora-settings/token', [TenantCoraSettingsController::class, 'token']);

    // Configurações de cobrança por tenant (escopos: billing, payment, enrollment)
    Route::get('tenant-billing-settings/schema',          [TenantBillingSettingsController::class, 'schema']);
    Route::get('tenant-billing-settings',                 [TenantBillingSettingsController::class, 'index']);
    Route::get('tenant-billing-settings/{scope}',         [TenantBillingSettingsController::class, 'show']);
    Route::put('tenant-billing-settings/{scope}',         [TenantBillingSettingsController::class, 'update']);
    Route::post('tenant-billing-settings/{scope}/reset',  [TenantBillingSettingsController::class, 'reset']);

    // Tema / cores do app mobile por tenant (painel)
    Route::get('tenant-mobile-theme',        [TenantMobileThemeController::class, 'show']);
    Route::put('tenant-mobile-theme',        [TenantMobileThemeController::class, 'update']);
    Route::post('tenant-mobile-theme/reset', [TenantMobileThemeController::class, 'reset']);

    // Administração de usuários (super_admin e admin)
    Route::apiResource('users', UserManagementController::class);

    // Alunos
    Route::apiResource('students', StudentController::class);
    Route::get('students/{student}/performance', [StudentPerformanceController::class, 'forStudent']);
    Route::post('students/{student}/upload-photo', [StudentController::class, 'uploadPhoto']);

    // Responsáveis de um aluno (nested)
    Route::prefix('students/{student}/guardians')->group(function () {
        Route::get('/available', [StudentGuardianController::class, 'available']);
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
    Route::get('enrollments/{enrollment}/contract-charges/preview', [EnrollmentController::class, 'contractChargesPreview']);
    Route::post('enrollments/{enrollment}/contract-charges/apply', [EnrollmentController::class, 'contractChargesApply']);
    Route::post('enrollments/{enrollment}/sync-cora-charges', [EnrollmentController::class, 'syncCoraCharges']);
    Route::post('enrollments/{enrollment}/generate-charges',  [EnrollmentController::class, 'generateCharges']);
    Route::apiResource('enrollments', EnrollmentController::class);

    // Provedores de gateway (catálogo técnico para tela de configuração)
    Route::get('payment-gateway-providers', [PaymentProviderController::class, 'index']);

    // Provedores de Pagamento (CRUD)
    Route::apiResource('payment-providers', PaymentProvidersController::class);

    // Cobranças
    Route::get('invoices/summary', [InvoiceController::class, 'summary']);
    Route::apiResource('invoices', InvoiceController::class);
    Route::post('invoices/{invoice}/mark-as-paid', [InvoiceController::class, 'markAsPaid']);
    Route::post('invoices/{invoice}/cancel', [InvoiceController::class, 'cancel']);
    Route::post('invoices/{invoice}/generate-cora-charge', [InvoiceController::class, 'generateCoraCharge']);
    Route::get('invoices/{invoice}/payment-options', [PaymentProviderController::class, 'paymentOptions']);
    Route::post('invoices/{invoice}/generate-charge', [PaymentProviderController::class, 'generateCharge']);
    Route::get('invoices/{invoice}/charge-status', [PaymentProviderController::class, 'chargeStatus']);
    Route::post('invoices/{invoice}/pay-charge', [PaymentProviderController::class, 'payCharge']);
    Route::get('invoices/{invoice}/receipt', [ReceiptController::class, 'show']);

    Route::get('tenants/{tenant}/payment-providers/{provider}/settings-schema', [PaymentProviderController::class, 'settingsSchema']);
    Route::post('tenants/{tenant}/payment-providers/{provider}/settings', [PaymentProviderController::class, 'saveSettings']);
    Route::post('tenants/{tenant}/payment-providers/{provider}/test-connection', [PaymentProviderController::class, 'testConnection']);

    // Tokens de API por tenant
    Route::get('tenant-api-tokens', [TenantApiTokenController::class, 'index']);
    Route::post('tenant-api-tokens', [TenantApiTokenController::class, 'store']);
    Route::delete('tenant-api-tokens/{tenantApiToken}', [TenantApiTokenController::class, 'destroy']);

    // Calendário / eventos
    Route::get('calendar-events/types', [CalendarEventController::class, 'types']);
    Route::get('calendar-events', [CalendarEventController::class, 'index']);
    Route::post('calendar-events', [CalendarEventController::class, 'store']);
    Route::put('calendar-events/{calendarEvent}', [CalendarEventController::class, 'update']);
    Route::delete('calendar-events/{calendarEvent}', [CalendarEventController::class, 'destroy']);

    Route::get('aluno/calendar-events/types', [StudentCalendarController::class, 'types']);
    Route::get('aluno/calendar-events', [StudentCalendarController::class, 'index']);

    // Notificações do aluno (mobile — sino)
    Route::get('aluno/notifications/unread-count', [StudentNotificationController::class, 'unreadCount']);
    Route::post('aluno/notifications/read-all',   [StudentNotificationController::class, 'markAllAsRead']);
    Route::get('aluno/notifications',             [StudentNotificationController::class, 'index']);
    Route::get('aluno/notifications/{notification}', [StudentNotificationController::class, 'show']);
    Route::patch('aluno/notifications/{notification}/read', [StudentNotificationController::class, 'markAsRead']);

    // Notificações — painel admin
    Route::get('notifications/settings',                 [TenantNotificationSettingsController::class, 'show']);
    Route::put('notifications/settings',                 [TenantNotificationSettingsController::class, 'update']);
    Route::get('notifications/types',                    [NotificationBroadcastController::class, 'types']);
    Route::post('notifications/preview',                 [NotificationBroadcastController::class, 'preview']);
    Route::post('notifications/send',                    [NotificationBroadcastController::class, 'send']);
    Route::get('notifications/broadcasts',               [NotificationBroadcastController::class, 'index']);
    Route::get('notifications/broadcasts/{broadcast}',   [NotificationBroadcastController::class, 'show']);

    // Simulados do aluno autenticado (role: aluno)
    Route::get('aluno/mobile-theme',             [TenantMobileThemeController::class, 'forStudent']);
    Route::get('aluno/dashboard',                [StudentDashboardController::class, 'index']);
    Route::get('aluno/performance',              [StudentPerformanceController::class, 'forAuthenticatedStudent']);
    Route::get('aluno/boletos',                  [StudentFinanceController::class, 'boletos']);
    Route::get('aluno/cobrancas/{invoice}/payment-options', [StudentFinanceController::class, 'paymentOptions']);
    Route::post('aluno/cobrancas/{invoice}/generate-charge', [StudentFinanceController::class, 'generateCharge']);
    Route::get('aluno/cobrancas/{invoice}/receipt', [ReceiptController::class, 'aluno']);
    Route::get('aluno/exams',                    [StudentExamController::class, 'index']);
    Route::get('aluno/exams/{exam}',             [StudentExamController::class, 'show']);
    Route::get('aluno/attempts',                 [StudentExamController::class, 'attempts']);
    Route::get('aluno/attempts/{attempt}',       [StudentExamController::class, 'reviewAttempt']);
    Route::get('aluno/attempts/{attempt}/review',[StudentExamController::class, 'reviewAttempt']);

    // Simulados
    Route::apiResource('exams', ExamController::class);
    Route::get('exams/{exam}/stats',   [ExamController::class, 'stats']);

    // Domínios de simulados (lookup tables — read-only)
    Route::get('exam-statuses', fn () => response()->json(\App\Models\ExamStatus::orderBy('order')->get(['id', 'slug', 'label'])));
    Route::get('exam-types', fn () => response()->json(
        \App\Models\ExamType::query()->orderBy('label')->get(['id', 'slug', 'label'])
    ));

    // Questões de um simulado (nested)
    Route::get('exams/{exam}/questions',               [ExamQuestionController::class, 'index']);
    Route::post('exams/{exam}/questions/upload-image', [ExamQuestionController::class, 'uploadImage']);
    Route::post('exams/{exam}/questions',              [ExamQuestionController::class, 'store']);
    Route::get('exams/{exam}/questions/{question}',    [ExamQuestionController::class, 'show']);
    Route::put('exams/{exam}/questions/{question}',    [ExamQuestionController::class, 'update']);
    Route::delete('exams/{exam}/questions/{question}', [ExamQuestionController::class, 'destroy']);

    // Materiais de apoio de um simulado (nested)
    Route::get('exams/{exam}/support-materials',                 [SupportMaterialController::class, 'index']);
    Route::post('exams/{exam}/support-materials',                [SupportMaterialController::class, 'store']);
    Route::post('exams/{exam}/support-materials/upload',         [SupportMaterialController::class, 'uploadFile']);
    Route::get('exams/{exam}/support-materials/{material}',      [SupportMaterialController::class, 'show']);
    Route::put('exams/{exam}/support-materials/{material}',      [SupportMaterialController::class, 'update']);
    Route::delete('exams/{exam}/support-materials/{material}',   [SupportMaterialController::class, 'destroy']);

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
