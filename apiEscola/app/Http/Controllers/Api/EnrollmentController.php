<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreEnrollmentRequest;
use App\Http\Requests\SubscribeEnrollmentRequest;
use App\Http\Requests\UpdateEnrollmentRequest;
use App\Http\Resources\EnrollmentResource;
use App\Models\CoursePlan;
use App\Models\CourseBundle;
use App\Models\Enrollment;
use App\Models\Invoice;
use App\Models\SchoolClass;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class EnrollmentController extends Controller
{
    use ScopedByTenant;

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
            'enrollment_number' => $request->input('enrollment_number') ?? strtoupper(Str::random(8)),
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

        $enrollment->load(['student', 'schoolClass.course']);

        return response()->json(new EnrollmentResource($enrollment));
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

        $enrollment->update($request->validated());
        $enrollment->load(['student', 'schoolClass.course']);

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

        $enrollment->delete();

        return response()->json(['message' => 'Matrícula removida com sucesso.']);
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

        $plan = CoursePlan::with('course')->findOrFail($request->course_plan_id);
        $this->authorizeTenant($request, $plan->tenant_id);

        // Resolve responsável financeiro: usa o informado ou busca o marcado como financeiro do aluno
        $guardianId = $request->guardian_id
            ?? \App\Models\Student::find($request->student_id)
                ?->guardians()
                ->wherePivot('is_financial_responsible', true)
                ->first()
                ?->id;

        $enrollment = DB::transaction(function () use ($request, $plan, $tenantId, $guardianId) {
            $enrollment = Enrollment::create([
                'tenant_id'         => $tenantId ?? $plan->tenant_id,
                'student_id'        => $request->student_id,
                'school_class_id'   => $request->school_class_id,
                'course_plan_id'    => $plan->id,
                'enrollment_number' => strtoupper(Str::random(8)),
                'start_date'        => $request->start_date,
                'end_date'          => $request->end_date,
                'status'            => 'active',
                'monthly_amount'    => $plan->monthlyEquivalent(),
                'discount_amount'   => $request->discount_amount ?? 0,
                'payment_due_day'   => $request->payment_due_day ?? 10,
            ]);

            // Cria invoice da taxa de matrícula (= valor da mensalidade)
            $netAmount    = $plan->monthlyEquivalent() - ($request->discount_amount ?? 0);
            $paymentData  = $request->input('enrollment_payment', []);
            $isPaid       = ! empty($paymentData['payment_method']);

            Invoice::create([
                'tenant_id'      => $tenantId ?? $plan->tenant_id,
                'enrollment_id'  => $enrollment->id,
                'student_id'     => $request->student_id,
                'guardian_id'    => $guardianId,
                'type'           => 'enrollment_fee',
                'description'    => 'Taxa de Matrícula — ' . $plan->course->name,
                'amount'         => max($netAmount, 0),
                'due_date'       => $request->start_date,
                'status'         => $isPaid ? 'paid' : 'pending',
                'paid_at'        => $isPaid ? ($paymentData['paid_at'] ?? now()) : null,
                'payment_method' => $paymentData['payment_method'] ?? null,
                'notes'          => $paymentData['notes'] ?? null,
            ]);

            return $enrollment;
        });

        $enrollment->load(['student', 'schoolClass.course', 'coursePlan.course', 'invoices']);

        return response()->json(array_merge(
            (new EnrollmentResource($enrollment))->resolve($request),
            ['financial_guardian_id' => $guardianId]
        ), 201);
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
            'school_class_ids.*'                 => ['required', 'integer', 'exists:school_classes,id'],
            'start_date'                         => ['required', 'date'],
            'end_date'                           => ['nullable', 'date', 'after:start_date'],
            'discount_amount'                    => ['nullable', 'numeric', 'min:0'],
            'payment_due_day'                    => ['nullable', 'integer', 'min:1', 'max:28'],
            'guardian_id'                        => ['nullable', 'integer', 'exists:guardians,id'],
            'enrollment_payment'                 => ['nullable', 'array'],
            'enrollment_payment.payment_method'  => ['nullable', 'string', 'exists:domain_payment_methods,slug'],
            'enrollment_payment.paid_at'         => ['nullable', 'date'],
            'enrollment_payment.notes'           => ['nullable', 'string', 'max:500'],
        ]);

        $tenantId = $this->getTenantId($request);

        $bundle = CourseBundle::with('courses')->findOrFail($data['bundle_id']);
        $this->authorizeTenant($request, $bundle->tenant_id);

        $guardianId = $data['guardian_id']
            ?? \App\Models\Student::find($data['student_id'])
                ?->guardians()
                ->wherePivot('is_financial_responsible', true)
                ->first()
                ?->id;

        // Equivalente mensal do pacote dividido pelo número de cursos
        $courseCount    = $bundle->courses->count();
        $monthlyAmount  = round($bundle->monthlyEquivalent() / max($courseCount, 1), 2);
        $paymentData    = $data['enrollment_payment'] ?? [];
        $isPaid         = ! empty($paymentData['payment_method']);

        // Taxa de matrícula = monthly_equivalent do pacote inteiro (menos desconto)
        $feeAmount = max($bundle->monthlyEquivalent() - ($data['discount_amount'] ?? 0), 0);

        $result = DB::transaction(function () use ($data, $bundle, $tenantId, $monthlyAmount, $guardianId, $feeAmount, $isPaid, $paymentData) {
            $created          = [];
            $firstEnrollment  = null;

            foreach ($data['school_class_ids'] as $schoolClassId) {
                $enrollment = Enrollment::create([
                    'tenant_id'         => $tenantId ?? $bundle->tenant_id,
                    'student_id'        => $data['student_id'],
                    'school_class_id'   => $schoolClassId,
                    'bundle_id'         => $bundle->id,
                    'enrollment_number' => strtoupper(Str::random(8)),
                    'start_date'        => $data['start_date'],
                    'end_date'          => $data['end_date'] ?? null,
                    'status'            => 'active',
                    'monthly_amount'    => $monthlyAmount,
                    'discount_amount'   => $data['discount_amount'] ?? 0,
                    'payment_due_day'   => $data['payment_due_day'] ?? 10,
                ]);

                $firstEnrollment ??= $enrollment;
                $enrollment->load(['student', 'schoolClass.course', 'bundle.courses']);
                $created[] = new EnrollmentResource($enrollment);
            }

            // Uma única invoice para a taxa de matrícula do pacote inteiro
            $invoice = Invoice::create([
                'tenant_id'      => $tenantId ?? $bundle->tenant_id,
                'enrollment_id'  => $firstEnrollment->id,
                'student_id'     => $data['student_id'],
                'guardian_id'    => $guardianId,
                'type'           => 'enrollment_fee',
                'description'    => 'Taxa de Matrícula — ' . $bundle->name,
                'amount'         => $feeAmount,
                'due_date'       => $data['start_date'],
                'status'         => $isPaid ? 'paid' : 'pending',
                'paid_at'        => $isPaid ? ($paymentData['paid_at'] ?? now()) : null,
                'payment_method' => $paymentData['payment_method'] ?? null,
                'notes'          => $paymentData['notes'] ?? null,
            ]);

            return ['enrollments' => $created, 'invoice' => $invoice];
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
            'enrollment_fee' => new \App\Http\Resources\InvoiceResource($result['invoice']),
            'financial_guardian_id' => $guardianId,
        ], 201);
    }
}
