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
use App\Http\Controllers\Api\AsaasWebhookController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\PaymentProviderController;
use App\Http\Controllers\Api\PaymentProvidersController;
use App\Http\Controllers\Api\PublicRegistrationController;
use App\Http\Controllers\Api\ReceiptController;
use App\Http\Controllers\Api\UserManagementController;
use App\Http\Controllers\Api\NotificationBroadcastController;
use App\Http\Controllers\Api\TenantMobileThemeController;
use App\Http\Controllers\Api\TenantAiSettingsController;
use App\Http\Controllers\Api\QuestionAiController;
use App\Http\Controllers\Api\TenantNotificationSettingsController;
use App\Http\Controllers\Api\StudentNotificationController;
use App\Http\Controllers\Api\CalendarEventController;
use App\Http\Controllers\Api\StudentCalendarController;
use App\Http\Controllers\Api\PastExamController;
use App\Http\Controllers\Api\OfficialAssessmentController;
use App\Http\Controllers\Api\StudentPastExamController;
use App\Http\Controllers\Api\ExamTypeController;
use App\Http\Controllers\Api\QuestionSetController;
use App\Http\Controllers\Api\QuestionBankPracticeController;
use App\Http\Controllers\Api\StudentPracticeController;
use App\Http\Controllers\Api\StudentLearningController;
use App\Http\Controllers\Api\QuestionBankController;
use App\Http\Controllers\Api\QuestionCatalogController;
use App\Http\Controllers\Api\SubjectTopicController;
use App\Http\Controllers\Api\ReportController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

// Health check (público)
Route::get('/health', [HealthController::class, 'check']);

// Webhook Asaas (público — validação por ASAAS_WEBHOOK_TOKEN)
Route::post('/webhooks/asaas', [AsaasWebhookController::class, 'handle'])
    ->middleware('throttle:120,1');

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

    // Proxy autenticado para arquivos públicos que precisam ser lidos pelo app web
    // sem depender do CORS do servidor estático /storage.
    Route::get('media/storage/{path}', function (string $path) {
        $normalized = trim(preg_replace('#/+#', '/', $path) ?? '', '/');

        if ($normalized === '' || str_contains($normalized, '..')) {
            abort(404);
        }

        $disk = Storage::disk('public');

        if (! $disk->exists($normalized)) {
            abort(404);
        }

        return response($disk->get($normalized), 200, [
            'Content-Type' => $disk->mimeType($normalized) ?: 'application/octet-stream',
            'Cache-Control' => 'public, max-age=3600',
            'Content-Disposition' => 'inline; filename="'.basename($normalized).'"',
        ]);
    })->where('path', '.*');

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

    // Chaves de IA do tenant (criptografadas). Super admin usa as chaves do .env.
    Route::get('ai-settings',               [TenantAiSettingsController::class, 'index']);
    Route::put('ai-settings/{provider}',    [TenantAiSettingsController::class, 'update']);
    Route::delete('ai-settings/{provider}', [TenantAiSettingsController::class, 'destroy']);

    // Administração de usuários (super_admin e admin)
    Route::apiResource('users', UserManagementController::class);

    // Alunos
    Route::apiResource('students', StudentController::class);
    Route::get('students/{student}/performance', [StudentPerformanceController::class, 'forStudent']);
    Route::get('students/{student}/academic-history', [StudentPerformanceController::class, 'academicHistory']);
    Route::post('students/{student}/upload-photo', [StudentController::class, 'uploadPhoto']);
    Route::post('students/{student}/provision-app-access', [StudentController::class, 'provisionAppAccess']);

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
    Route::get('reports/class-students', [ReportController::class, 'classStudents']);
    Route::get('reports/finance', [ReportController::class, 'finance']);

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
    Route::post('enrollments/{enrollment}/contract-charges/purge-imported', [EnrollmentController::class, 'contractChargesPurgeImported']);
    Route::post('enrollments/{enrollment}/sync-cora-charges', [EnrollmentController::class, 'syncCoraCharges']);
    Route::post('enrollments/{enrollment}/generate-charges',  [EnrollmentController::class, 'generateCharges']);
    Route::get('enrollments/{enrollment}/carne/preview', [EnrollmentController::class, 'carnePreview']);
    Route::post('enrollments/{enrollment}/carne/generate', [EnrollmentController::class, 'carneGenerate']);
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

    // Banco de questões do aluno: prática avulsa e simulados do banco (sem nota oficial)
    Route::get('aluno/practice/filters',                       [StudentPracticeController::class, 'filters']);
    Route::get('aluno/practice/performance',                   [StudentPracticeController::class, 'performance']);
    Route::get('aluno/practice/ranking',                       [StudentPracticeController::class, 'ranking']);
    Route::get('aluno/practice/next-question',                 [StudentPracticeController::class, 'nextQuestion']);
    Route::post('aluno/practice/questions/{question}/answer',  [StudentPracticeController::class, 'answerQuestion'])->whereNumber('question');
    Route::get('aluno/practice/summary',                       [StudentPracticeController::class, 'summary']);
    Route::get('aluno/practice/questions',                     [StudentPracticeController::class, 'questions']);
    Route::get('aluno/practice/facets',                        [StudentPracticeController::class, 'facets']);
    Route::post('aluno/practice/questions/{question}/save',    [StudentPracticeController::class, 'saveQuestion'])->whereNumber('question');
    Route::delete('aluno/practice/questions/{question}/save',  [StudentPracticeController::class, 'unsaveQuestion'])->whereNumber('question');
    Route::post('aluno/practice/sessions',                     [StudentPracticeController::class, 'startSession']);
    Route::get('aluno/question-sets',                          [StudentPracticeController::class, 'sets']);
    Route::post('aluno/question-sets/{set}/start',             [StudentPracticeController::class, 'startSet'])->whereNumber('set');
    Route::get('aluno/practice-attempts/{attempt}',            [StudentPracticeController::class, 'showAttempt'])->whereNumber('attempt');
    Route::post('aluno/practice-attempts/{attempt}/answer',    [StudentPracticeController::class, 'answerInAttempt'])->whereNumber('attempt');
    Route::post('aluno/practice-attempts/{attempt}/finish',    [StudentPracticeController::class, 'finishAttempt'])->whereNumber('attempt');

    Route::get('aluno/learning/overview',         [StudentLearningController::class, 'overview']);
    Route::get('aluno/learning/topics',           [StudentLearningController::class, 'topics']);
    Route::get('aluno/learning/recommendations',  [StudentLearningController::class, 'recommendations']);
    Route::get('aluno/learning/evolution',        [StudentLearningController::class, 'evolution']);
    Route::post('aluno/learning/reinforcement',   [StudentLearningController::class, 'reinforcement']);

    Route::get('aluno/past-exams', [StudentPastExamController::class, 'index']);
    Route::get('aluno/past-exams/{pastExam}', [StudentPastExamController::class, 'show']);

    // Provas anteriores (painel)
    Route::post('past-exams/upload', [PastExamController::class, 'uploadFile']);
    Route::post('past-exams/{pastExam}/replace-file', [PastExamController::class, 'replaceFile']);
    Route::apiResource('past-exams', PastExamController::class);

    // Avaliações oficiais (presenciais para boletim)
    Route::apiResource('official-assessments', OfficialAssessmentController::class);
    Route::post('official-assessments/{officialAssessment}/grades', [OfficialAssessmentController::class, 'upsertGrades']);
    Route::post('official-assessments/{officialAssessment}/publish', [OfficialAssessmentController::class, 'publish']);
    Route::get('students/{student}/report-card', [OfficialAssessmentController::class, 'studentReportCard']);

    // Simulados
    Route::apiResource('exams', ExamController::class);
    Route::get('exams/{exam}/stats',           [ExamController::class, 'stats']);
    Route::get('exams/{exam}/delivery-report', [ExamController::class, 'deliveryReport']);
    Route::get('exams/{exam}/question-errors-report', [ExamController::class, 'questionErrorsReport']);

    // Domínios de simulados (lookup tables)
    Route::get('exam-statuses', fn () => response()->json(\App\Models\ExamStatus::orderBy('order')->get(['id', 'slug', 'label'])));
    Route::get('exam-types', [ExamTypeController::class, 'index']);

    // Classificações de prova (ENEM, Vestibular, etc.) — gestão super admin
    Route::get('admin/exam-types', [ExamTypeController::class, 'adminIndex']);
    Route::post('admin/exam-types', [ExamTypeController::class, 'store']);
    Route::put('admin/exam-types/{examType}', [ExamTypeController::class, 'update']);
    Route::delete('admin/exam-types/{examType}', [ExamTypeController::class, 'destroy']);
    Route::post('admin/exam-types/{examType}/logo', [ExamTypeController::class, 'uploadLogo']);
    Route::delete('admin/exam-types/{examType}/logo', [ExamTypeController::class, 'destroyLogo']);

    // Banco de questões (avulsas e de simulados): listagem e classificação
    Route::prefix('question-bank')->group(function () {
        Route::get('import-drafts', [\App\Http\Controllers\Api\QuestionImportDraftController::class, 'index']);
        Route::post('import-drafts', [\App\Http\Controllers\Api\QuestionImportDraftController::class, 'store']);
        Route::get('import-drafts/{draft}', [\App\Http\Controllers\Api\QuestionImportDraftController::class, 'show'])->whereUuid('draft');
        Route::put('import-drafts/{draft}', [\App\Http\Controllers\Api\QuestionImportDraftController::class, 'update'])->whereUuid('draft');
        Route::delete('import-drafts/{draft}', [\App\Http\Controllers\Api\QuestionImportDraftController::class, 'destroy'])->whereUuid('draft');
        Route::post('import-drafts/{draft}/questions/{key}/include', [\App\Http\Controllers\Api\QuestionImportDraftController::class, 'includeQuestion'])->whereUuid('draft');
        Route::get('questions',                          [QuestionBankController::class, 'index']);
        Route::get('questions/ids',                      [QuestionBankController::class, 'ids']);
        Route::post('questions',                         [QuestionBankController::class, 'store']);
        Route::post('questions/upload-image',            [QuestionBankController::class, 'uploadImage']);
        Route::post('exams-from-questions',              [QuestionBankController::class, 'createExam']);
        Route::get('imported-exams',                     [QuestionBankController::class, 'importedExams']);
        Route::delete('imported-exams/{exam}',           [QuestionBankController::class, 'destroyImportedExam'])->whereNumber('exam');
        Route::post('imported-exams/{exam}/questions',   [QuestionBankController::class, 'appendToImportedExam'])->whereNumber('exam');

        // Simulados do banco de questões (importados de PDF ou montados pelo admin; separados dos oficiais)
        Route::get('practice-ranking',                           [QuestionBankPracticeController::class, 'ranking']);
        Route::get('question-sets',                              [QuestionSetController::class, 'index']);
        Route::post('question-sets',                             [QuestionSetController::class, 'store']);
        Route::post('question-sets/generate',                    [QuestionSetController::class, 'generate']);
        Route::get('question-sets/{set}',                        [QuestionSetController::class, 'show'])->whereNumber('set');
        Route::put('question-sets/{set}',                        [QuestionSetController::class, 'update'])->whereNumber('set');
        Route::delete('question-sets/{set}',                     [QuestionSetController::class, 'destroy'])->whereNumber('set');
        Route::post('question-sets/{set}/questions',             [QuestionSetController::class, 'addQuestions'])->whereNumber('set');
        Route::put('question-sets/{set}/questions/order',        [QuestionSetController::class, 'reorder'])->whereNumber('set');
        Route::delete('question-sets/{set}/questions/{question}', [QuestionSetController::class, 'removeQuestion'])->whereNumber(['set', 'question']);
        Route::put('questions/{question}',               [QuestionBankController::class, 'update'])->whereNumber('question');
        Route::delete('questions/{question}',            [QuestionBankController::class, 'destroy'])->whereNumber('question');
        Route::get('questions/years',                    [QuestionBankController::class, 'years']);
        Route::get('exam-options',                       [QuestionBankController::class, 'examOptions']);
        Route::patch('questions/classification',         [QuestionBankController::class, 'batchClassification']);
        Route::get('questions/{question}',               [QuestionBankController::class, 'show'])->whereNumber('question');
        Route::patch('questions/{question}/classification', [QuestionBankController::class, 'updateClassification'])->whereNumber('question');

        // IA: sugestões; rascunhos de imagens ficam auditados até a aprovação.
        Route::get('ai/status', [QuestionAiController::class, 'status']);
        Route::middleware('throttle:30,1')->group(function () {
            Route::post('ai/autofill',                       [QuestionAiController::class, 'autofill']);
            Route::post('ai/classify',                       [QuestionAiController::class, 'classify']);
            Route::post('ai/extract',                        [QuestionAiController::class, 'extract']);
            Route::post('ai/extract-pdf', [QuestionAiController::class, 'extractPdf']);
            Route::post('ai/separate-text', [QuestionAiController::class, 'separateText']);
            Route::post('questions/{question}/ai/similar',   [QuestionAiController::class, 'similar'])->whereNumber('question');
            Route::post('ai/review', [QuestionAiController::class, 'review']);
            Route::post('ai/review/correct', [QuestionAiController::class, 'correct']);
            Route::get('questions/{question}/ai/reviews', [QuestionAiController::class, 'reviews'])->whereNumber('question');
            Route::post('questions/{question}/ai/review/approve', [QuestionAiController::class, 'approveReview'])->whereNumber('question');
            Route::post('ai/image-generations/{generation}/regenerate', [QuestionAiController::class, 'regenerateImage'])->whereUuid('generation');
            Route::post('ai/redraw-image', [QuestionAiController::class, 'redrawImage']);
        });

        Route::get('subjects',          [SubjectTopicController::class, 'subjects']);
        Route::get('taxonomy',          [SubjectTopicController::class, 'taxonomy']);
        Route::post('taxonomy/import-default', [SubjectTopicController::class, 'importDefault']);
        Route::get('subjects/{subject}/default-topics', [SubjectTopicController::class, 'defaultTopics'])->whereNumber('subject');
        Route::post('subjects/{subject}/topics/import-default', [SubjectTopicController::class, 'importDefaultTopics'])->whereNumber('subject');
        Route::get('topics',            [SubjectTopicController::class, 'index']);
        Route::post('topics',           [SubjectTopicController::class, 'store']);
        Route::put('topics/{id}',       [SubjectTopicController::class, 'update'])->whereNumber('id');
        Route::delete('topics/{id}',    [SubjectTopicController::class, 'destroy'])->whereNumber('id');

        Route::get('catalogs',                     [QuestionCatalogController::class, 'catalogs']);
        Route::get('catalogs/{catalog}',           [QuestionCatalogController::class, 'index']);
        Route::post('catalogs/{catalog}',          [QuestionCatalogController::class, 'store']);
        Route::put('catalogs/{catalog}/{id}',      [QuestionCatalogController::class, 'update'])->whereNumber('id');
        Route::delete('catalogs/{catalog}/{id}',   [QuestionCatalogController::class, 'destroy'])->whereNumber('id');
    });

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
