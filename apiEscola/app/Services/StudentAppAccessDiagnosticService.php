<?php

namespace App\Services;

use App\Models\Enrollment;
use App\Models\Invoice;
use App\Models\Student;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class StudentAppAccessDiagnosticService
{
    /**
     * Metadados fixos sobre onde o sistema cria (ou não) usuário de app.
     *
     * @return array<string, mixed>
     */
    public function creationPathsLegend(): array
    {
        return [
            'POST /api/students (painel — cadastro aluno)' => 'Cria usuário via StudentAppAccessService::provision',
            'POST /api/students/{id}/provision-app-access' => 'Cria usuário sob demanda (painel)',
            'POST /api/public/{slug}/register (pré-cadastro app)' => 'Gera matrícula, NÃO cria usuário',
            'POST /api/enrollments/subscribe' => 'Matricula aluno e provisiona usuário se ainda não existir',
            'POST /api/enrollments/subscribe-bundle' => 'Matricula pacote e provisiona usuário se ainda não existir',
            'POST /api/enrollments (store)' => 'Cria matrícula, NÃO cria usuário',
            'POST /api/invoices/{id}/mark-as-paid (baixa)' => 'Atualiza cobrança, NÃO cria usuário',
            'Pagamento taxa matrícula no subscribe' => 'Marca invoice como paga, NÃO cria usuário',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function report(?int $tenantId = null, ?int $studentId = null, int $sampleLimit = 30): array
    {
        $base = $this->scopedStudentsQuery($tenantId, $studentId);

        $total = (clone $base)->count();
        $withUser = (clone $base)->whereNotNull('user_id')->whereHas('user')->count();
        $withoutUser = (clone $base)->where(function (Builder $q) {
            $q->whereNull('user_id')->orWhereDoesntHave('user');
        })->count();
        $orphanUserId = (clone $base)->whereNotNull('user_id')->whereDoesntHave('user')->count();

        $withoutUserQuery = (clone $base)->where(function (Builder $q) {
            $q->whereNull('user_id')->orWhereDoesntHave('user');
        });

        $withActiveEnrollmentNoUser = (clone $withoutUserQuery)
            ->whereHas('enrollments', fn (Builder $q) => $q->where('status', 'active'))
            ->count();

        $withPaidEnrollmentFeeNoUser = $this->countWithoutUserMatchingInvoice(
            $tenantId,
            $studentId,
            'enrollment_fee',
            'paid'
        );

        $withAnyPaidInvoiceNoUser = $this->countWithoutUserMatchingInvoice(
            $tenantId,
            $studentId,
            null,
            'paid'
        );

        $byStatus = (clone $withoutUserQuery)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status')
            ->all();

        $samples = $this->mapStudentRows(
            (clone $withoutUserQuery)
                ->with([
                    'enrollments' => fn ($q) => $q->orderByDesc('id')->limit(3),
                    'enrollments.invoices' => fn ($q) => $q->orderBy('due_date'),
                ])
                ->orderBy('name')
                ->limit($studentId !== null ? 1 : $sampleLimit)
                ->get()
        );

        return [
            'generated_at' => now()->toIso8601String(),
            'filters' => [
                'tenant_id' => $tenantId,
                'student_id' => $studentId,
            ],
            'summary' => [
                'students_total' => $total,
                'with_app_user' => $withUser,
                'without_app_user' => $withoutUser,
                'orphan_user_id' => $orphanUserId,
                'with_active_enrollment_without_user' => $withActiveEnrollmentNoUser,
                'with_paid_enrollment_fee_without_user' => $withPaidEnrollmentFeeNoUser,
                'with_any_paid_invoice_without_user' => $withAnyPaidInvoiceNoUser,
                'without_user_by_status' => $byStatus,
            ],
            'conclusion' => $this->buildConclusion(
                $withoutUser,
                $withPaidEnrollmentFeeNoUser,
                $withActiveEnrollmentNoUser
            ),
            'where_user_is_created' => $this->creationPathsLegend(),
            'samples_without_user' => $samples,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function studentDetail(Student $student): array
    {
        $student->load([
            'user',
            'enrollments' => fn ($q) => $q->orderByDesc('id'),
            'enrollments.invoices' => fn ($q) => $q->orderBy('due_date'),
        ]);

        $hasAccess = app(StudentAppAccessService::class)->hasAppAccess($student);

        $invoices = Invoice::query()
            ->where('student_id', $student->id)
            ->orderByDesc('id')
            ->limit(20)
            ->get(['id', 'enrollment_id', 'type', 'status', 'amount', 'due_date', 'paid_at']);

        return [
            'student' => $this->mapStudentRow($student),
            'has_app_user' => $hasAccess,
            'user' => $student->user ? [
                'id' => $student->user->id,
                'email' => $student->user->email,
                'role' => $student->user->role,
                'status' => $student->user->status,
                'password_change_required' => $student->user->password_change_required,
            ] : null,
            'enrollments' => $student->enrollments->map(fn (Enrollment $e) => [
                'id' => $e->id,
                'enrollment_number' => $e->enrollment_number,
                'status' => $e->status,
                'start_date' => $e->start_date?->toDateString(),
                'invoices' => $e->invoices->map(fn (Invoice $inv) => [
                    'id' => $inv->id,
                    'type' => $inv->type,
                    'status' => $inv->status,
                    'amount' => (string) $inv->amount,
                    'due_date' => $inv->due_date?->toDateString(),
                    'paid_at' => $inv->paid_at?->toIso8601String(),
                ])->values()->all(),
            ])->values()->all(),
            'recent_invoices' => $invoices->map(fn (Invoice $inv) => [
                'id' => $inv->id,
                'enrollment_id' => $inv->enrollment_id,
                'type' => $inv->type,
                'status' => $inv->status,
                'amount' => (string) $inv->amount,
                'due_date' => $inv->due_date?->toDateString(),
                'paid_at' => $inv->paid_at?->toIso8601String(),
            ])->all(),
            'recommended_actions' => $this->recommendedActions($student, $hasAccess),
        ];
    }

    private function scopedStudentsQuery(?int $tenantId, ?int $studentId): Builder
    {
        $query = Student::query();

        if ($tenantId !== null) {
            $query->where('tenant_id', $tenantId);
        }

        if ($studentId !== null) {
            $query->whereKey($studentId);
        }

        return $query;
    }

    private function countWithoutUserMatchingInvoice(
        ?int $tenantId,
        ?int $studentId,
        ?string $invoiceType,
        string $status
    ): int {
        $query = Student::query()
            ->where(function (Builder $q) {
                $q->whereNull('user_id')->orWhereDoesntHave('user');
            })
            ->whereHas('invoices', function (Builder $q) use ($invoiceType, $status) {
                $q->where('status', $status);
                if ($invoiceType !== null) {
                    $q->where('type', $invoiceType);
                }
            });

        if ($tenantId !== null) {
            $query->where('tenant_id', $tenantId);
        }

        if ($studentId !== null) {
            $query->whereKey($studentId);
        }

        return $query->count();
    }

    /**
     * @return array<string, string>
     */
    private function buildConclusion(int $withoutUser, int $paidFeeNoUser, int $activeEnrollmentNoUser): array
    {
        $lines = [];

        if ($withoutUser === 0) {
            $lines['status'] = 'Todos os alunos filtrados possuem usuário de app vinculado.';
        } else {
            $lines['status'] = "{$withoutUser} aluno(s) sem usuário de app (login no mobile).";
        }

        $lines['payment_activation'] = $paidFeeNoUser > 0
            ? "Há {$paidFeeNoUser} aluno(s) com taxa de matrícula PAGA e mesmo assim sem usuário — a baixa de cobrança NÃO ativa login no código atual."
            : 'Nenhum aluno filtrado com taxa de matrícula paga ficou sem usuário (ou não há taxa paga nesse recorte).';

        $lines['enrollment_flow'] = $activeEnrollmentNoUser > 0
            ? "Há {$activeEnrollmentNoUser} aluno(s) com matrícula ativa e sem usuário — provável matrícula antes do deploy ou cadastro sem passar por subscribe. Use students:provision-users."
            : 'Nenhum aluno com matrícula ativa ficou sem usuário neste recorte.';

        $lines['fix_batch'] = 'Correção em lote: php artisan students:provision-users --tenant=ID [--dry-run]';
        $lines['fix_single'] = 'Correção unitária: painel → Alunos → ficha → "Gerar acesso ao app" ou provision-users --student=ID';

        return $lines;
    }

    /**
     * @return list<string>
     */
    private function recommendedActions(Student $student, bool $hasAccess): array
    {
        if ($hasAccess) {
            return ['Aluno já possui usuário. Login no app = número da matrícula (students.enrollment_number).'];
        }

        $actions = ['Executar: php artisan students:provision-users --student=' . $student->id . ' --show-passwords'];

        if (filled($student->enrollment_number)) {
            $actions[] = 'Matrícula já existe (' . $student->enrollment_number . '); o provisionamento reutiliza esse número.';
        } else {
            $actions[] = 'Sem matrícula no cadastro; o provisionamento irá gerar enrollment_number automaticamente.';
        }

        $paidFee = $student->invoices->contains(
            fn (Invoice $i) => $i->type === 'enrollment_fee' && $i->status === 'paid'
        );

        if ($paidFee) {
            $actions[] = 'Taxa de matrícula consta como paga — isso NÃO criou usuário (comportamento esperado do sistema hoje).';
        }

        return $actions;
    }

    /**
     * @param  Collection<int, Student>  $students
     * @return list<array<string, mixed>>
     */
    private function mapStudentRows(Collection $students): array
    {
        return $students->map(fn (Student $s) => $this->mapStudentRow($s))->values()->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function mapStudentRow(Student $student): array
    {
        $activeEnrollments = $student->relationLoaded('enrollments')
            ? $student->enrollments->where('status', 'active')->count()
            : $student->enrollments()->where('status', 'active')->count();

        $paidEnrollmentFee = false;
        $pendingEnrollmentFee = false;

        if ($student->relationLoaded('enrollments')) {
            foreach ($student->enrollments as $enrollment) {
                if (! $enrollment->relationLoaded('invoices')) {
                    continue;
                }
                foreach ($enrollment->invoices as $invoice) {
                    if ($invoice->type !== 'enrollment_fee') {
                        continue;
                    }
                    if ($invoice->status === 'paid') {
                        $paidEnrollmentFee = true;
                    }
                    if ($invoice->status === 'pending') {
                        $pendingEnrollmentFee = true;
                    }
                }
            }
        }

        return [
            'id' => $student->id,
            'tenant_id' => $student->tenant_id,
            'name' => $student->name,
            'status' => $student->status,
            'enrollment_number' => $student->enrollment_number,
            'user_id' => $student->user_id,
            'birth_date' => $student->birth_date?->toDateString(),
            'active_enrollments' => $activeEnrollments,
            'enrollment_fee_paid' => $paidEnrollmentFee,
            'enrollment_fee_pending' => $pendingEnrollmentFee,
            'would_login_with' => $student->enrollment_number ?? '(matrícula será gerada no provisionamento)',
        ];
    }
}
