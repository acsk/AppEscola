<?php

namespace App\Http\Controllers\Api;

use App\Jobs\SyncEnrollmentCoraChargesJob;
use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreEnrollmentRequest;
use App\Http\Requests\SubscribeEnrollmentRequest;
use App\Http\Requests\UpdateEnrollmentRequest;
use App\Http\Resources\EnrollmentResource;
use App\Models\CoursePlan;
use App\Models\CourseBundle;
use App\Models\Enrollment;
use App\Models\Guardian;
use App\Models\Invoice;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Services\EnrollmentContractChargesService;
use App\Services\EnrollmentFinancialLockService;
use App\Services\EnrollmentInvoiceAmountSyncService;
use App\Services\EnrollmentInvoiceDescriptionService;
use App\Services\InvoiceLifecycleService;
use App\Services\InvoiceSettlementService;
use App\Services\TenantBillingSettingsService;
use App\Traits\ScopedByTenant;
use Carbon\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class EnrollmentController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly InvoiceLifecycleService $invoiceLifecycle,
        private readonly EnrollmentContractChargesService $contractCharges,
        private readonly EnrollmentInvoiceAmountSyncService $invoiceAmountSync,
        private readonly EnrollmentFinancialLockService $financialLock,
        private readonly EnrollmentInvoiceDescriptionService $invoiceDescriptions,
    ) {
    }

    #[OA\Get(
        path: '/api/enrollments',
        tags: ['Enrollments'],
        summary: 'Listar matrículas',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'student_id', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'school_class_id', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'start_date', in: 'query', required: false, schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'end_date', in: 'query', required: false, schema: new OA\Schema(type: 'string', format: 'date')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de matrículas'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Enrollment::query()->with(['student', 'schoolClass.course']);
        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('student_id'), fn ($q, $v) => $q->where('student_id', $v))
            ->when($request->query('school_class_id'), fn ($q, $v) => $q->where('school_class_id', $v))
            ->when($request->query('start_date'), fn ($q, $v) => $q->whereDate('start_date', '>=', $v))
            ->when($request->query('end_date'), fn ($q, $v) => $q->whereDate('start_date', '<=', $v));

        return EnrollmentResource::collection($query->latest()->paginate(20));
    }

    #[OA\Post(
        path: '/api/enrollments',
        tags: ['Enrollments'],
        summary: 'Criar matrícula',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados da matrícula')),
        responses: [
            new OA\Response(response: 201, description: 'Matrícula criada'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreEnrollmentRequest $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $data = array_merge($request->validated(), [
            'tenant_id' => $tenantId,
            'enrollment_number' => $request->input('enrollment_number') ?? $this->generateEnrollmentNumber($tenantId),
        ]);

        $enrollment = Enrollment::create($data);
        $enrollment->load(['student', 'schoolClass.course']);

        return response()->json(new EnrollmentResource($enrollment), 201);
    }

    #[OA\Get(
        path: '/api/enrollments/{id}',
        tags: ['Enrollments'],
        summary: 'Exibir matrícula',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados da matrícula'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, Enrollment $enrollment): JsonResponse
    {
        $this->authorizeTenant($request, $enrollment->tenant_id);

        $enrollment->load([
            'student',
            'schoolClass.course',
            'coursePlan.course',
            'bundle',
            'invoices' => fn ($q) => $q->orderBy('due_date'),
        ]);

        return response()->json(new EnrollmentResource($enrollment));
    }

    #[OA\Post(
        path: '/api/enrollments/{id}/generate-charges',
        tags: ['Enrollments'],
        summary: 'Gerar cobranças locais em lote para a matrícula',
        description: 'Ação única (one-shot): depois que o lote local é processado, este endpoint retorna 409. Ele cria apenas invoices locais que ainda não existirem e não envia nada para o provedor. Cobranças individuais continuam disponíveis via /invoices/{id}/generate-charge.',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(
            required: false,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'invoice_types', type: 'array', items: new OA\Items(type: 'string'), description: 'Tipos de invoice locais a garantir. Ex: ["monthly"]. Omitir gera apenas monthly.', example: ['monthly', 'enrollment_fee']),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Cobranças locais geradas com sucesso'),
            new OA\Response(response: 409, description: 'Cobranças locais já foram geradas em lote para esta matrícula'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function generateCharges(Request $request, Enrollment $enrollment): JsonResponse
    {
        $this->authorizeTenant($request, $enrollment->tenant_id);

        // One-shot: impede segunda geração em lote
        if ($enrollment->charges_generated_at !== null) {
            return $this->error(
                'As cobranças em lote já foram geradas para esta matrícula em ' . $enrollment->charges_generated_at->format('d/m/Y H:i') . '. Para gerar cobranças adicionais, use a criação individual por invoice.',
                ['charges_generated_at' => $enrollment->charges_generated_at->toISOString()],
                409
            );
        }

        $data = $request->validate([
            'invoice_types' => ['nullable', 'array'],
            'invoice_types.*' => ['string', 'in:enrollment_fee,monthly'],
        ]);

        $enrollment->loadMissing(['student', 'schoolClass.course', 'coursePlan.course', 'invoices']);

        $invoiceTypes = empty($data['invoice_types'])
            ? ['monthly']
            : array_values(array_filter(array_map(
                static fn ($value) => strtolower(trim((string) $value)),
                $data['invoice_types']
            )));

        if (empty($invoiceTypes)) {
            return $this->error(
                'Informe ao menos um tipo de invoice local para gerar.',
                ['enrollment_id' => $enrollment->id],
                422
            );
        }

        $generated  = [];
        $created = 0;
        $existing = 0;

        $plan = $enrollment->coursePlan;
        if (! $plan) {
            return $this->error(
                'A matrícula não possui plano associado para gerar cobranças locais.',
                ['enrollment_id' => $enrollment->id],
                422
            );
        }

        $guardianId = $this->resolveInvoicePayer($enrollment->student_id, $enrollment->tenant_id)['guardian_id'];
        $startDate = Carbon::parse($enrollment->start_date ?? now());
        $endDate = $enrollment->end_date
            ? Carbon::parse($enrollment->end_date)
            : $startDate->copy()->addMonths($plan->monthsInCycle())->subDay();
        $billing = $this->billingScope($enrollment->tenant_id);
        $dueDay = (int) ($enrollment->payment_due_day ?? $billing['default_payment_due_day'] ?? 10);
        $netAmount = $enrollment->netMonthlyAmount();
        $enrollmentFeeAmount = $this->resolveEnrollmentFeeAmount($plan, $enrollment);

        // Sem taxa no plano ou escola não cobra → remove enrollment_fee do lote
        if (empty($billing['charges_enrollment_fee']) || $enrollmentFeeAmount === null) {
            $invoiceTypes = array_values(array_filter(
                $invoiceTypes,
                static fn ($t) => $t !== 'enrollment_fee'
            ));
        }

        // Regra: bloqueia mensalidades enquanto a taxa de matrícula não estiver paga
        if (
            in_array('monthly', $invoiceTypes, true)
            && ! empty($billing['charges_enrollment_fee'])
            && empty($billing['allow_monthlies_before_fee_paid'])
        ) {
            $hasPendingFee = Invoice::query()
                ->where('enrollment_id', $enrollment->id)
                ->where('type', 'enrollment_fee')
                ->whereIn('status', ['pending', 'overdue'])
                ->exists();

            if ($hasPendingFee) {
                return $this->error(
                    'Não é possível gerar mensalidades enquanto a taxa de matrícula não estiver paga.',
                    ['enrollment_id' => $enrollment->id],
                    422
                );
            }
        }

        if (empty($invoiceTypes)) {
            return $this->error(
                'Nenhum tipo de invoice válido a gerar conforme as configurações de cobrança do tenant.',
                ['enrollment_id' => $enrollment->id],
                422
            );
        }

        $enrollmentFeeCoversFirstMonth = ! empty($billing['charges_enrollment_fee'])
            && ! empty($billing['enrollment_fee_covers_first_month']);

        DB::transaction(function () use (
            $enrollment,
            $invoiceTypes,
            $startDate,
            $endDate,
            $dueDay,
            $netAmount,
            $enrollmentFeeAmount,
            $enrollmentFeeCoversFirstMonth,
            $guardianId,
            &$generated,
            &$created,
            &$existing
        ) {
            if (in_array('enrollment_fee', $invoiceTypes, true) && $enrollmentFeeAmount !== null) {
                $invoice = Invoice::firstOrCreate(
                    [
                        'tenant_id' => $enrollment->tenant_id,
                        'enrollment_id' => $enrollment->id,
                        'type' => 'enrollment_fee',
                        'due_date' => $startDate->toDateString(),
                    ],
                    [
                        'student_id' => $enrollment->student_id,
                        'guardian_id' => $guardianId,
                        'description' => $this->invoiceDescriptions->forEnrollmentCharge(
                            $enrollment,
                            'enrollment_fee',
                            $startDate->toDateString()
                        ),
                        'amount' => max($enrollmentFeeAmount, 0),
                        'status' => 'pending',
                    ]
                );

                if ($invoice->wasRecentlyCreated) {
                    $created++;
                } else {
                    $existing++;
                }

                $generated[] = [
                    'invoice_id' => $invoice->id,
                    'type' => $invoice->type,
                    'due_date' => $invoice->due_date?->toDateString(),
                    'amount' => $invoice->amount,
                    'status' => $invoice->status,
                    'created' => $invoice->wasRecentlyCreated,
                ];
            }

            if (in_array('monthly', $invoiceTypes, true)) {
                $cursor = $startDate->copy()->day($dueDay);
                if ($cursor->lt($startDate)) {
                    $cursor->addMonth();
                }

                if ($enrollmentFeeCoversFirstMonth) {
                    $cursor->addMonth();
                }

                while ($cursor->lte($endDate)) {
                    $invoice = Invoice::firstOrCreate(
                        [
                            'tenant_id' => $enrollment->tenant_id,
                            'enrollment_id' => $enrollment->id,
                            'type' => 'monthly',
                            'due_date' => $cursor->toDateString(),
                        ],
                        [
                            'student_id' => $enrollment->student_id,
                            'guardian_id' => $guardianId,
                            'description' => $this->invoiceDescriptions->forEnrollmentCharge(
                                $enrollment,
                                'monthly',
                                $cursor->toDateString()
                            ),
                            'amount' => $netAmount,
                            'status' => 'pending',
                        ]
                    );

                    if ($invoice->wasRecentlyCreated) {
                        $created++;
                    } else {
                        $existing++;
                    }

                    $generated[] = [
                        'invoice_id' => $invoice->id,
                        'type' => $invoice->type,
                        'due_date' => $invoice->due_date?->toDateString(),
                        'amount' => $invoice->amount,
                        'status' => $invoice->status,
                        'created' => $invoice->wasRecentlyCreated,
                    ];

                    $cursor->addMonth();
                }
            }

            $enrollment->update(['charges_generated_at' => now()]);
        });

        return $this->success([
            'enrollment_id'        => $enrollment->id,
            'status'               => 'success',
            'generated_count'      => $created,
            'existing_count'       => $existing,
            'charges_generated_at' => $enrollment->fresh()->charges_generated_at?->toISOString(),
            'generated'            => $generated,
        ], $created > 0 ? 'Cobranças locais geradas em lote com sucesso.' : 'Cobranças locais já existiam e o lote foi marcado como processado.', 200);
    }

    private function resolveEnrollmentFeeAmount(CoursePlan $plan, ?Enrollment $enrollment = null): ?float
    {
        $planFee = $plan->enrollment_fee_amount;

        if ($planFee === null) {
            return null;
        }

        $amount = (float) $planFee;
        if ($amount <= 0) {
            return null;
        }

        $discount = $enrollment !== null
            ? (float) ($enrollment->discount_amount ?? 0)
            : 0.0;
        $net = max($amount - $discount, 0);

        return $net > 0 ? $net : null;
    }

    private function normalizePaymentDueDay(int $dueDay): int
    {
        return max(1, min(28, $dueDay));
    }

    private function firstMonthlyDueDate(Carbon $startDate, int $dueDay): Carbon
    {
        $dueDay = $this->normalizePaymentDueDay($dueDay);
        $cursor = $startDate->copy()->day($dueDay);
        if ($cursor->lt($startDate)) {
            $cursor->addMonth();
        }

        return $cursor;
    }

    /**
     * @param  array<string, mixed>  $paymentData
     */
    private function createEnrollmentInvoice(
        int $tenantId,
        int $enrollmentId,
        int $studentId,
        ?int $guardianId,
        string $type,
        string $description,
        float $amount,
        string $dueDate,
        array $paymentData,
    ): Invoice {
        $isPaid = ! empty($paymentData['payment_method']);

        return Invoice::create([
            'tenant_id'         => $tenantId,
            'enrollment_id'     => $enrollmentId,
            'student_id'        => $studentId,
            'guardian_id'       => $guardianId,
            'type'              => $type,
            'description'       => $description,
            'amount'            => $amount,
            'due_date'          => $dueDate,
            'status'            => $isPaid ? 'paid' : 'pending',
            'paid_at'           => $isPaid ? ($paymentData['paid_at'] ?? now()) : null,
            'payment_method'    => $paymentData['payment_method'] ?? null,
            'payment_reference' => $paymentData['payment_reference'] ?? null,
            'notes'             => $paymentData['notes'] ?? null,
        ]);
    }

    public function contractChargesPreview(Request $request, Enrollment $enrollment): JsonResponse
    {
        $this->authorizeTenant($request, $enrollment->tenant_id);

        $data = $request->validate([
            'environment' => ['nullable', 'string', 'in:stage,prod,production'],
            'invoice_types' => ['nullable', 'array'],
            'invoice_types.*' => ['string', 'in:enrollment_fee,monthly'],
            // Query string costuma vir como "1"/"true" — não usar rule boolean (rejeita alguns clientes).
            'debug' => ['nullable'],
        ]);

        $environment = $this->resolveContractChargesEnvironment($request, $data['environment'] ?? null);
        $invoiceTypes = $data['invoice_types'] ?? ['monthly'];
        $includeDebug = $this->parseTruthyParam($request, 'debug', $data['debug'] ?? null);

        if ($includeDebug && ! $this->canUseContractChargesDebug($request)) {
            return $this->error(
                'Debug de cobranças não autorizado. Use super_admin ou defina CORA_CONTRACT_CHARGES_DEBUG=true no servidor.',
                ['enrollment_id' => $enrollment->id],
                403
            );
        }

        try {
            $preview = $this->contractCharges->preview($enrollment, $environment, $invoiceTypes, $includeDebug);
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), ['enrollment_id' => $enrollment->id], 422);
        }

        return $this->success($preview, 'Pré-visualização das cobranças do contrato.');
    }

    public function contractChargesApply(Request $request, Enrollment $enrollment): JsonResponse
    {
        $this->authorizeTenant($request, $enrollment->tenant_id);

        $data = $request->validate([
            'environment' => ['nullable', 'string', 'in:stage,prod,production'],
            'generate_keys' => ['nullable', 'array'],
            'generate_keys.*' => ['string', 'max:80'],
            'sync_charge_ids' => ['nullable', 'array'],
            'sync_charge_ids.*' => ['string', 'max:255'],
            'create_missing' => ['nullable', 'boolean'],
        ]);

        $environment = $this->resolveContractChargesEnvironment($request, $data['environment'] ?? null);
        $generateKeys = $data['generate_keys'] ?? [];
        $syncChargeIds = $data['sync_charge_ids'] ?? [];

        if ($generateKeys === [] && $syncChargeIds === []) {
            $generateKeys = array_values(array_filter(array_map(
                static fn ($key) => str_starts_with((string) $key, 'generate:') ? (string) $key : null,
                $request->input('selected_keys', [])
            )));
            $syncChargeIds = array_values(array_filter(array_map(
                static function ($key) {
                    $key = (string) $key;
                    if (! str_starts_with($key, 'sync:')) {
                        return null;
                    }

                    return substr($key, 5);
                },
                $request->input('selected_keys', [])
            )));
        }

        try {
            $result = $this->contractCharges->apply(
                $enrollment,
                $environment,
                $generateKeys,
                $syncChargeIds,
                (bool) ($data['create_missing'] ?? true),
            );
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), ['enrollment_id' => $enrollment->id], 422);
        } catch (ConnectionException $e) {
            return $this->error(
                'Não foi possível conectar ao provedor para sincronizar cobranças.',
                ['detail' => $e->getMessage()],
                502
            );
        } catch (RequestException $e) {
            return $this->error(
                'O provedor recusou a sincronização das cobranças.',
                [
                    'http_status' => $e->response?->status(),
                    'detail' => $e->response?->json(),
                ],
                502
            );
        }

        $created = (int) ($result['generated']['created'] ?? 0);
        $syncCreated = (int) ($result['sync']['created'] ?? 0);
        $syncUpdated = (int) ($result['sync']['updated'] ?? 0);

        $message = match (true) {
            $created > 0 && $syncCreated + $syncUpdated > 0 => "Contrato: {$created} cobrança(s) gerada(s). Cora: {$syncCreated} criada(s), {$syncUpdated} atualizada(s).",
            $created > 0 => "Cobranças do contrato geradas: {$created}.",
            $syncCreated + $syncUpdated > 0 => "Sincronização concluída: {$syncCreated} criada(s), {$syncUpdated} atualizada(s).",
            default => 'Operação concluída.',
        };

        return $this->success($result, $message);
    }

    private function parseTruthyParam(Request $request, string $key, mixed $validated = null): bool
    {
        $value = $validated ?? $request->query($key);

        if ($value === null || $value === '') {
            return false;
        }

        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value) || is_float($value)) {
            return (int) $value !== 0;
        }

        $normalized = strtolower(trim((string) $value));

        return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
    }

    private function canUseContractChargesDebug(Request $request): bool
    {
        if ((bool) config('services.cora.contract_charges_debug', false)) {
            return true;
        }

        $user = $request->user();

        return $user && method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin();
    }

    private function resolveContractChargesEnvironment(Request $request, ?string $requested): string
    {
        $requestedEnv = (string) ($requested ?? 'prod');
        $requestedEnv = $requestedEnv === 'production' ? 'prod' : $requestedEnv;

        if (! app()->environment('production')) {
            return 'stage';
        }

        $user = $request->user();
        if ($user && method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return $requestedEnv ?: 'prod';
        }

        return 'prod';
    }

    public function syncCoraCharges(Request $request, Enrollment $enrollment): JsonResponse
    {
        $this->authorizeTenant($request, $enrollment->tenant_id);

        $data = $request->validate([
            'environment' => ['nullable', 'string', 'in:stage,prod,production'],
            'charge_ids' => ['nullable', 'array'],
            'charge_ids.*' => ['string', 'max:255'],
            'create_missing' => ['nullable', 'boolean'],
            'async' => ['nullable', 'boolean'],
        ]);

        $requestedEnv = (string) ($data['environment'] ?? 'prod');
        $requestedEnv = $requestedEnv === 'production' ? 'prod' : $requestedEnv;

        $environment = app()->environment('production') ? $requestedEnv : 'stage';

        $chargeIds = array_values(array_filter(array_map(
            static fn ($value) => trim((string) $value),
            $data['charge_ids'] ?? []
        )));

        $createMissing = (bool) ($data['create_missing'] ?? true);
        $async = (bool) ($data['async'] ?? false);

        $job = new SyncEnrollmentCoraChargesJob(
            enrollmentId: $enrollment->id,
            environment: $environment,
            chargeIds: $chargeIds,
            createMissing: $createMissing,
        );

        if ($async) {
            dispatch($job);

            return $this->success([
                'enrollment_id' => $enrollment->id,
                'tenant_id' => $enrollment->tenant_id,
                'environment' => $environment,
                'queued' => true,
                'charge_ids' => $chargeIds,
                'create_missing' => $createMissing,
            ], 'Sincronizacao de cobrancas da Cora enfileirada com sucesso.', 202);
        }

        // Executa sincronizacao de forma síncrona
        try {
            /** @var array<string, mixed> $result */
            $result = Bus::dispatchSync($job);
            
            return $this->success([
                'enrollment_id' => $result['enrollment_id'] ?? $enrollment->id,
                'tenant_id' => $result['tenant_id'] ?? $enrollment->tenant_id,
                'environment' => $result['environment'] ?? $environment,
                'external_total' => $result['external_total'] ?? 0,
                'created' => $result['created'] ?? 0,
                'updated' => $result['updated'] ?? 0,
                'ignored' => $result['ignored'] ?? 0,
                'processed_charge_ids' => $result['processed_charge_ids'] ?? [],
            ], 'Sincronizacao de cobrancas da Cora concluida com sucesso.');
        } catch (\Throwable $e) {
            Log::error('Erro ao sincronizar cobrancas Cora:', [
                'enrollment_id' => $enrollment->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            
            return $this->error('Erro ao sincronizar cobranças da Cora: ' . $e->getMessage(), null, 500);
        }
    }

    #[OA\Put(
        path: '/api/enrollments/{id}',
        tags: ['Enrollments'],
        summary: 'Atualizar matrícula',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Matrícula atualizada'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateEnrollmentRequest $request, Enrollment $enrollment): JsonResponse
    {
        $this->authorizeTenant($request, $enrollment->tenant_id);

        $validated = $request->validated();
        $this->financialLock->assertChangesAllowed($enrollment, $validated);
        $enrollment->update($validated);

        if (array_key_exists('monthly_amount', $validated) || array_key_exists('discount_amount', $validated)) {
            $enrollment->refresh();
            $this->invoiceAmountSync->syncPendingInvoices($enrollment);
        }

        $enrollment->load(['student', 'schoolClass.course', 'coursePlan.course']);

        return response()->json(new EnrollmentResource($enrollment));
    }

    #[OA\Delete(
        path: '/api/enrollments/{id}',
        tags: ['Enrollments'],
        summary: 'Remover matrícula',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, Enrollment $enrollment): JsonResponse
    {
        $this->authorizeTenant($request, $enrollment->tenant_id);

        $cancelSummary = $this->invoiceLifecycle->cancelEnrollmentInvoicesBeforeRemoval($enrollment, $request);

        if ($cancelSummary['failures'] !== [] || $cancelSummary['skipped'] > 0) {
            return $this->error(
                'Não foi possível encerrar todas as cobranças no provedor. A matrícula não foi removida.',
                ['invoice_cancellation' => $cancelSummary],
                422
            );
        }

        $enrollment->update(['status' => 'cancelled']);

        $enrollment->invoices()->delete();

        $enrollment->delete();

        return $this->success([
            'message' => 'Matrícula removida com sucesso.',
            'invoice_cancellation' => $cancelSummary,
        ], 'Matrícula removida com sucesso.');
    }

    #[OA\Post(
        path: '/api/enrollments/subscribe',
        tags: ['Enrollments'],
        summary: 'Matricular aluno em um plano de curso',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['student_id', 'school_class_id', 'course_plan_id', 'start_date'],
                properties: [
                    new OA\Property(property: 'student_id',      type: 'integer', example: 1),
                    new OA\Property(property: 'school_class_id', type: 'integer', example: 2),
                    new OA\Property(property: 'course_plan_id',  type: 'integer', example: 3),
                    new OA\Property(property: 'start_date',      type: 'string',  format: 'date', example: '2026-02-01'),
                    new OA\Property(property: 'end_date',        type: 'string',  format: 'date'),
                    new OA\Property(property: 'discount_amount', type: 'number',  format: 'float', example: 0),
                    new OA\Property(property: 'payment_due_day', type: 'integer', example: 10),
                    new OA\Property(property: 'guardian_id',     type: 'integer', description: 'Responsável financeiro (opcional, detectado automaticamente)'),
                    new OA\Property(
                        property: 'enrollment_payment',
                        type: 'object',
                        description: 'Pagamento da taxa de matrícula no ato. Omitir deixa a cobrança como pendente.',
                        properties: [
                            new OA\Property(property: 'payment_method', type: 'string', enum: ['cash','pix','credit_card','debit_card','bank_slip','transfer'], example: 'pix'),
                            new OA\Property(property: 'paid_at',        type: 'string', format: 'date', example: '2026-02-01'),
                            new OA\Property(property: 'notes',          type: 'string', example: 'Pago na recepção'),
                        ]
                    ),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Matrícula criada com invoice da taxa de matrícula'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
            new OA\Response(response: 403, description: 'Plano não pertence ao tenant'),
        ]
    )]
    public function subscribe(SubscribeEnrollmentRequest $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $plan        = CoursePlan::with('course')->findOrFail($request->course_plan_id);
        $schoolClass = SchoolClass::findOrFail($request->school_class_id);
        $this->authorizeTenant($request, $plan->tenant_id);

        $effectiveTenantId = (int) ($tenantId ?? $plan->tenant_id);
        $this->assertSubscribeEntities($request, $plan, $schoolClass, $effectiveTenantId);

        // Prioridade de datas:
        // start_date: request > hoje (data da matrícula — não o início da turma)
        // end_date:   request > turma > ciclo do plano
        $startDate = Carbon::parse($request->start_date ?? now());
        $endDate   = $request->end_date
            ? Carbon::parse($request->end_date)
            : ($schoolClass->end_date
                ? Carbon::parse($schoolClass->end_date)
                : $startDate->copy()->addMonths($plan->monthsInCycle())->subDay());

        if ($endDate->lt($startDate)) {
            $endDate = $startDate->copy()->addMonths($plan->monthsInCycle())->subDay();
        }

        try {
            $guardianId = $this->resolveFinancialGuardianForSubscribe($request, $effectiveTenantId);
        } catch (ValidationException $e) {
            return $this->validationError($e->errors(), 'Não foi possível concluir a matrícula.');
        }

        try {
            $enrollment = DB::transaction(function () use ($request, $plan, $tenantId, $guardianId, $startDate, $endDate) {
            $effectiveTenantId = (int) ($tenantId ?? $plan->tenant_id);
            $billing = $this->billingScope($effectiveTenantId);

            $dueDay = $this->normalizePaymentDueDay(
                (int) ($request->payment_due_day ?? $billing['default_payment_due_day'] ?? 10)
            );

            $enrollment = Enrollment::create([
                'tenant_id'         => $effectiveTenantId,
                'student_id'        => $request->student_id,
                'school_class_id'   => $request->school_class_id,
                'course_plan_id'    => $plan->id,
                'enrollment_number' => $this->generateEnrollmentNumber($effectiveTenantId),
                'start_date'        => $startDate->toDateString(),
                'end_date'          => $endDate->toDateString(),
                'status'            => 'active',
                'monthly_amount'    => $plan->monthlyEquivalent(),
                'discount_amount'   => $request->discount_amount ?? 0,
                'payment_due_day'   => $dueDay,
            ]);

            $netAmount = $enrollment->netMonthlyAmount();
            $enrollmentFeeAmount = $this->resolveEnrollmentFeeAmount($plan, $enrollment);

            $paymentData = $request->input('enrollment_payment', []);

            // Taxa de matrícula — só cria se a escola cobra e o plano tem valor cadastrado
            if (! empty($billing['charges_enrollment_fee']) && $enrollmentFeeAmount !== null) {
                $this->createEnrollmentInvoice(
                    tenantId: $effectiveTenantId,
                    enrollmentId: $enrollment->id,
                    studentId: $request->student_id,
                    guardianId: $guardianId,
                    type: 'enrollment_fee',
                    description: $this->invoiceDescriptions->forEnrollmentCharge(
                        $enrollment,
                        'enrollment_fee',
                        $startDate->toDateString()
                    ),
                    amount: $enrollmentFeeAmount,
                    dueDate: $startDate->toDateString(),
                    paymentData: $paymentData,
                );
            } elseif (
                ! empty($billing['charge_first_monthly_at_enrollment'])
                && $enrollmentFeeAmount === null
            ) {
                // Plano sem taxa: 1ª mensalidade no ato da matrícula (ex.: curso de 30 dias)
                $netMonthly = max($netAmount, 0);
                if ($netMonthly > 0) {
                    $firstDue = $this->firstMonthlyDueDate($startDate, $dueDay);
                    $this->createEnrollmentInvoice(
                        tenantId: $effectiveTenantId,
                        enrollmentId: $enrollment->id,
                        studentId: $request->student_id,
                        guardianId: $guardianId,
                        type: 'monthly',
                        description: $this->invoiceDescriptions->forEnrollmentCharge(
                            $enrollment,
                            'monthly',
                            $firstDue->toDateString()
                        ),
                        amount: $netMonthly,
                        dueDate: $firstDue->toDateString(),
                        paymentData: $paymentData,
                    );
                }
            }

            return $enrollment;
            });
        } catch (QueryException $e) {
            Log::error('Enrollment subscribe database error', [
                'tenant_id' => $effectiveTenantId,
                'student_id' => $request->student_id,
                'school_class_id' => $request->school_class_id,
                'course_plan_id' => $request->course_plan_id,
                'guardian_id' => $request->guardian_id,
                'error' => $e->getMessage(),
            ]);

            return $this->error($this->friendlySubscribeDatabaseMessage($e), null, 422);
        }

        $enrollment->load(['student', 'schoolClass.course', 'coursePlan.course', 'invoices']);

        return response()->json(array_merge(
            (new EnrollmentResource($enrollment))->resolve($request),
            ['financial_guardian_id' => $guardianId]
        ), 201);
    }

    private function assertSubscribeEntities(
        SubscribeEnrollmentRequest $request,
        CoursePlan $plan,
        SchoolClass $schoolClass,
        int $effectiveTenantId,
    ): void {
        $student = Student::query()->find($request->student_id);

        if (! $student || (int) $student->tenant_id !== $effectiveTenantId) {
            throw ValidationException::withMessages([
                'student_id' => ['Aluno não pertence a esta escola.'],
            ]);
        }

        if ((int) $schoolClass->tenant_id !== $effectiveTenantId) {
            throw ValidationException::withMessages([
                'school_class_id' => ['Turma não pertence a esta escola.'],
            ]);
        }

        if ((int) $plan->tenant_id !== $effectiveTenantId) {
            throw ValidationException::withMessages([
                'course_plan_id' => ['Plano não pertence a esta escola.'],
            ]);
        }

        if ((int) $plan->course_id !== (int) $schoolClass->course_id) {
            throw ValidationException::withMessages([
                'course_plan_id' => ['O plano selecionado não corresponde ao curso da turma.'],
            ]);
        }
    }

    private function resolveFinancialGuardianForSubscribe(
        SubscribeEnrollmentRequest $request,
        int $tenantId,
    ): ?int {
        if ($request->filled('guardian_id')) {
            return $this->resolveRequestedGuardianId(
                (int) $request->student_id,
                (int) $request->guardian_id,
                $tenantId
            );
        }

        return $this->resolveInvoicePayer((int) $request->student_id, $tenantId)['guardian_id'];
    }

    private function resolveRequestedGuardianId(int $studentId, int $guardianId, int $tenantId): int
    {
        $enrollmentSettings = $this->enrollmentScope($tenantId);
        $requireCpf = ! array_key_exists('require_cpf_to_enroll', $enrollmentSettings)
            ? true
            : (bool) $enrollmentSettings['require_cpf_to_enroll'];

        $guardian = Guardian::query()
            ->where('id', $guardianId)
            ->where('tenant_id', $tenantId)
            ->first();

        if (! $guardian) {
            throw ValidationException::withMessages([
                'guardian_id' => ['Responsável não encontrado nesta escola.'],
            ]);
        }

        $isLinked = Student::query()
            ->where('id', $studentId)
            ->where('tenant_id', $tenantId)
            ->whereHas('guardians', fn ($query) => $query->where('guardians.id', $guardianId))
            ->exists();

        if (! $isLinked) {
            throw ValidationException::withMessages([
                'guardian_id' => ['Responsável não vinculado a este aluno.'],
            ]);
        }

        if ($requireCpf && empty($guardian->document)) {
            throw ValidationException::withMessages([
                'guardian_id' => ['O responsável financeiro deve ter CPF cadastrado para realizar a matrícula.'],
            ]);
        }

        return $guardian->id;
    }

    private function friendlySubscribeDatabaseMessage(QueryException $exception): string
    {
        $message = strtolower($exception->getMessage());

        if (str_contains($message, 'domain_invoice_types')) {
            return 'Tipo de cobrança não cadastrado no servidor. Execute as migrações/seeders de domínio (domain_invoice_types).';
        }

        if (str_contains($message, 'domain_invoice_statuses')) {
            return 'Status de cobrança não cadastrado no servidor. Execute as migrações/seeders de domínio (domain_invoice_statuses).';
        }

        if (str_contains($message, 'domain_enrollment_statuses')) {
            return 'Status de matrícula não cadastrado no servidor. Execute as migrações/seeders de domínio (domain_enrollment_statuses).';
        }

        if (str_contains($message, 'foreign key constraint')) {
            return 'Não foi possível gravar a matrícula: referência de cadastro ausente ou inválida no banco de dados.';
        }

        return 'Não foi possível gravar a matrícula. Verifique os dados e tente novamente.';
    }

    /**
     * Determina o pagador das cobranças e valida que o CPF está preenchido.
     * - Aluno maior de idade (is_minor = false): paga com o próprio CPF (guardian_id = null).
     * - Aluno menor de idade (is_minor = true): o responsável financeiro é o pagador.
     * Em ambos os casos, o CPF (document) é obrigatório para emissão das cobranças.
     */
    /**
     * Gera um número de matrícula sequencial e único por tenant.
     * Formato: MAT-{tenant_id}-{NNNNN} (ex: MAT-3-00042)
     */
    private function generateEnrollmentNumber(int $tenantId): string
    {
        $prefix = sprintf('MAT-%d-', $tenantId);

        $latest = DB::table('enrollments')
            ->where('tenant_id', $tenantId)
            ->where('enrollment_number', 'like', $prefix . '%')
            ->lockForUpdate()
            ->orderByDesc('id')
            ->value('enrollment_number');

        $next = 1;
        if (is_string($latest) && preg_match('/-(\d+)$/', $latest, $matches)) {
            $next = ((int) $matches[1]) + 1;
        }

        return sprintf('MAT-%d-%05d', $tenantId, $next);
    }

    private function resolveInvoicePayer(int $studentId, int $tenantId): array
    {
        $enrollmentSettings = $this->enrollmentScope($tenantId);
        $requireCpf = ! array_key_exists('require_cpf_to_enroll', $enrollmentSettings)
            ? true
            : (bool) $enrollmentSettings['require_cpf_to_enroll'];
        $requireGuardianForMinors = ! array_key_exists('require_guardian_for_minors', $enrollmentSettings)
            ? true
            : (bool) $enrollmentSettings['require_guardian_for_minors'];

        $student = \App\Models\Student::with([
            'guardians' => fn ($q) => $q->wherePivot('is_financial_responsible', true),
        ])->findOrFail($studentId);

        if ($student->is_minor) {
            $guardian = $student->guardians->first();

            if ($requireGuardianForMinors && ! $guardian) {
                throw ValidationException::withMessages([
                    'student_id' => ['Aluno menor de idade deve ter um responsável financeiro cadastrado.'],
                ]);
            }

            if ($guardian && $requireCpf && empty($guardian->document)) {
                throw ValidationException::withMessages([
                    'student_id' => ['O responsável financeiro deve ter CPF cadastrado para realizar a matrícula.'],
                ]);
            }

            if ($guardian) {
                return ['guardian_id' => $guardian->id];
            }

            if ($requireCpf && empty($student->document)) {
                throw ValidationException::withMessages([
                    'student_id' => ['O aluno deve ter CPF cadastrado para realizar a matrícula.'],
                ]);
            }

            return ['guardian_id' => null];
        }

        // Maior de idade — aluno é o próprio pagador
        if ($requireCpf && empty($student->document)) {
            throw ValidationException::withMessages([
                'student_id' => ['O aluno deve ter CPF cadastrado para realizar a matrícula.'],
            ]);
        }

        return ['guardian_id' => null];
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }

    #[OA\Post(
        path: '/api/enrollments/subscribe-bundle',
        tags: ['Enrollments'],
        summary: 'Matricular aluno em um pacote de cursos',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['student_id', 'bundle_id', 'school_class_ids', 'start_date'],
                properties: [
                    new OA\Property(property: 'student_id',      type: 'integer', example: 1),
                    new OA\Property(property: 'bundle_id',       type: 'integer', example: 1),
                    new OA\Property(
                        property: 'school_class_ids',
                        type: 'array',
                        description: 'Um ID de turma por curso do pacote (mesma ordem não importa)',
                        items: new OA\Items(type: 'integer')
                    ),
                    new OA\Property(property: 'start_date',      type: 'string',  format: 'date', example: '2026-02-01'),
                    new OA\Property(property: 'end_date',        type: 'string',  format: 'date'),
                    new OA\Property(property: 'discount_amount', type: 'number',  format: 'float', example: 0),
                    new OA\Property(property: 'payment_due_day', type: 'integer', example: 10),
                    new OA\Property(property: 'guardian_id',     type: 'integer', description: 'Responsável financeiro (opcional, detectado automaticamente)'),
                    new OA\Property(
                        property: 'enrollment_payment',
                        type: 'object',
                        description: 'Pagamento da taxa de matrícula do pacote. Uma única cobrança para o pacote inteiro.',
                        properties: [
                            new OA\Property(property: 'payment_method', type: 'string', enum: ['cash','pix','credit_card','debit_card','bank_slip','transfer'], example: 'pix'),
                            new OA\Property(property: 'paid_at',        type: 'string', format: 'date', example: '2026-02-01'),
                            new OA\Property(property: 'notes',          type: 'string', example: 'Pago na recepção'),
                        ]
                    ),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Matrículas criadas (uma por curso) + invoice da taxa de matrícula do pacote'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function subscribeBundle(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_id'                         => ['required', 'integer', 'exists:students,id'],
            'bundle_id'                          => ['required', 'integer', 'exists:course_bundles,id'],
            'school_class_ids'                   => ['required', 'array', 'min:1'],
            'school_class_ids.*'                 => [
                'required',
                'integer',
                'exists:school_classes,id',
                Rule::unique('enrollments', 'school_class_id')
                    ->where('student_id', $request->input('student_id'))
                    ->whereNotIn('status', ['cancelled']),
            ],
            'start_date'                         => ['nullable', 'date'],
            'end_date'                           => ['nullable', 'date', 'after:start_date'],
            'discount_amount'                    => ['nullable', 'numeric', 'min:0'],
            'payment_due_day'                    => ['nullable', 'integer', 'min:1', 'max:28'],
            'guardian_id'                        => ['nullable', 'integer', 'exists:guardians,id'],
            'enrollment_payment'                 => ['nullable', 'array'],
            'enrollment_payment.payment_method'     => ['nullable', 'string', 'exists:domain_payment_methods,slug'],
            'enrollment_payment.paid_at'            => ['nullable', 'date'],
            'enrollment_payment.payment_reference'  => ['nullable', 'string', 'max:120'],
            'enrollment_payment.notes'              => ['nullable', 'string', 'max:500'],
        ]);

        $paymentMethod = (string) ($data['enrollment_payment']['payment_method'] ?? '');
        $paymentReference = trim((string) ($data['enrollment_payment']['payment_reference'] ?? ''));
        if ($paymentMethod !== '' && app(InvoiceSettlementService::class)->requiresPaymentReference($paymentMethod) && $paymentReference === '') {
            return response()->json([
                'message' => 'Informe o identificador da transação no cartão de crédito.',
                'errors' => [
                    'enrollment_payment.payment_reference' => ['Informe o identificador da transação no cartão de crédito.'],
                ],
            ], 422);
        }

        $tenantId = $this->getTenantId($request);

        $bundle = CourseBundle::with('courses')->findOrFail($data['bundle_id']);
        $this->authorizeTenant($request, $bundle->tenant_id);

        $effectiveTenantId = $tenantId ?? $bundle->tenant_id;

        // Resolve pagador e valida CPF obrigatório
        $payer      = $this->resolveInvoicePayer($data['student_id'], $effectiveTenantId);
        $guardianId = $payer['guardian_id'];

        // Equivalente mensal do pacote dividido pelo número de cursos
        $courseCount    = $bundle->courses->count();
        $monthlyAmount  = round($bundle->monthlyEquivalent() / max($courseCount, 1), 2);
        $paymentData    = $data['enrollment_payment'] ?? [];
        $isPaid         = ! empty($paymentData['payment_method']);

        // Taxa de matrícula = monthly_equivalent do pacote inteiro (menos desconto)
        $feeAmount = max($bundle->monthlyEquivalent() - ($data['discount_amount'] ?? 0), 0);

        // Prioridade de datas:
        // start_date: request > hoje (data da matrícula — não o início da turma)
        // end_date:   request > primeira turma > ciclo do pacote
        $firstSchoolClass = SchoolClass::find($data['school_class_ids'][0]);
        $startDate = Carbon::parse($data['start_date'] ?? now());
        $endDate   = isset($data['end_date'])
            ? Carbon::parse($data['end_date'])
            : ($firstSchoolClass?->end_date
                ? Carbon::parse($firstSchoolClass->end_date)
                : $startDate->copy()->addMonths($bundle->monthsInCycle())->subDay());

        $result = DB::transaction(function () use ($data, $bundle, $tenantId, $monthlyAmount, $guardianId, $feeAmount, $isPaid, $paymentData, $startDate, $endDate) {
            $effectiveTenantId = $tenantId ?? $bundle->tenant_id;
            $billing           = $this->billingScope($effectiveTenantId);
            $created           = [];
            $firstEnrollment   = null;
            $dueDay            = $data['payment_due_day'] ?? (int) ($billing['default_payment_due_day'] ?? 10);
            $netMonthly        = max($bundle->monthlyEquivalent() - ($data['discount_amount'] ?? 0), 0);

            foreach ($data['school_class_ids'] as $schoolClassId) {
                $enrollment = Enrollment::create([
                    'tenant_id'         => $effectiveTenantId,
                    'student_id'        => $data['student_id'],
                    'school_class_id'   => $schoolClassId,
                    'bundle_id'         => $bundle->id,
                    'enrollment_number' => $this->generateEnrollmentNumber($effectiveTenantId),
                    'start_date'        => $startDate->toDateString(),
                    'end_date'          => $endDate->toDateString(),
                    'status'            => 'active',
                    'monthly_amount'    => $monthlyAmount,
                    'discount_amount'   => $data['discount_amount'] ?? 0,
                    'payment_due_day'   => $dueDay,
                ]);

                $firstEnrollment ??= $enrollment;
                $enrollment->load(['student', 'schoolClass.course', 'bundle.courses']);
                $created[] = new EnrollmentResource($enrollment);
            }

            // Taxa de matrícula única para o pacote (só cria se a escola cobra)
            $invoice = null;
            if (! empty($billing['charges_enrollment_fee'])) {
                $invoice = Invoice::create([
                    'tenant_id'      => $effectiveTenantId,
                    'enrollment_id'  => $firstEnrollment->id,
                    'student_id'     => $data['student_id'],
                    'guardian_id'    => $guardianId,
                    'type'           => 'enrollment_fee',
                    'description'    => $this->invoiceDescriptions->forEnrollmentCharge(
                        $firstEnrollment,
                        'enrollment_fee',
                        $startDate->toDateString()
                    ),
                    'amount'         => $feeAmount,
                    'due_date'       => $startDate->toDateString(),
                    'status'         => $isPaid ? 'paid' : 'pending',
                    'paid_at'        => $isPaid ? ($paymentData['paid_at'] ?? now()) : null,
                    'payment_method' => $paymentData['payment_method'] ?? null,
                    'payment_reference' => $paymentData['payment_reference'] ?? null,
                    'notes'          => $paymentData['notes'] ?? null,
                ]);
            }

            $canGenerateMonthliesNow = true;
            if (! empty($billing['charges_enrollment_fee']) && empty($billing['allow_monthlies_before_fee_paid'])) {
                $canGenerateMonthliesNow = $isPaid;
            }

            // Gera mensalidades para cada mês do período (uma invoice cobre o pacote inteiro)
            if ($canGenerateMonthliesNow) {
                $cursor = $startDate->copy()->day($dueDay);
                if ($cursor->lt($startDate)) {
                    $cursor->addMonth();
                }

                $enrollmentFeeCoversFirstMonth = ! empty($billing['charges_enrollment_fee'])
                    && ! empty($billing['enrollment_fee_covers_first_month']);
                if ($enrollmentFeeCoversFirstMonth) {
                    $cursor->addMonth();
                }

                while ($cursor->lte($endDate)) {
                    Invoice::create([
                        'tenant_id'      => $effectiveTenantId,
                        'enrollment_id'  => $firstEnrollment->id,
                        'student_id'     => $data['student_id'],
                        'guardian_id'    => $guardianId,
                        'type'           => 'monthly',
                        'description'    => $this->invoiceDescriptions->forEnrollmentCharge(
                            $firstEnrollment,
                            'monthly',
                            $cursor->toDateString()
                        ),
                        'amount'         => $netMonthly,
                        'due_date'       => $cursor->toDateString(),
                        'status'         => 'pending',
                    ]);
                    $cursor->addMonth();
                }
            }

            // Coleta mensalidades para retornar na resposta
            $monthlyInvoices = Invoice::where('enrollment_id', $firstEnrollment->id)
                ->where('type', 'monthly')
                ->orderBy('due_date')
                ->get();

            return [
                'enrollments' => $created,
                'invoice' => $invoice,
                'monthly_invoices' => $monthlyInvoices,
                'monthly_generation_skipped' => ! $canGenerateMonthliesNow,
            ];
        });

        return response()->json([
            'enrollments' => $result['enrollments'],
            'bundle'      => [
                'id'                 => $bundle->id,
                'name'               => $bundle->name,
                'billing_cycle'      => $bundle->billing_cycle,
                'cycle_label'        => $bundle->cycleLabel(),
                'price'              => $bundle->price,
                'monthly_equivalent' => $bundle->monthlyEquivalent(),
            ],
            'enrollment_fee'   => $result['invoice']
                ? new \App\Http\Resources\InvoiceResource($result['invoice'])
                : null,
            'monthly_invoices' => \App\Http\Resources\InvoiceResource::collection($result['monthly_invoices']),
            'monthly_generation_skipped' => (bool) ($result['monthly_generation_skipped'] ?? false),
            'financial_guardian_id' => $guardianId,
        ], 201);
    }

    /**
     * Retorna o escopo "billing" das configurações do tenant (com defaults aplicados).
     *
     * @return array<string,mixed>
     */
    private function billingScope(int $tenantId): array
    {
        static $cache = [];

        if (isset($cache[$tenantId])) {
            return $cache[$tenantId];
        }

        $tenant = Tenant::find($tenantId);
        if (! $tenant) {
            return $cache[$tenantId] = [];
        }

        return $cache[$tenantId] = app(TenantBillingSettingsService::class)->scope($tenant, 'billing');
    }

    /**
     * Retorna o escopo "enrollment" das configurações do tenant (com defaults aplicados).
     *
     * @return array<string,mixed>
     */
    private function enrollmentScope(int $tenantId): array
    {
        static $cache = [];

        if (isset($cache[$tenantId])) {
            return $cache[$tenantId];
        }

        $tenant = Tenant::find($tenantId);
        if (! $tenant) {
            return $cache[$tenantId] = [];
        }

        return $cache[$tenantId] = app(TenantBillingSettingsService::class)->scope($tenant, 'enrollment');
    }
}
