<?php

namespace App\Services;

use App\Models\Enrollment;
use App\Models\Invoice;
use App\Models\Tenant;
use App\Services\TenantBillingSettingsService;
use Carbon\Carbon;

class EnrollmentInvoiceDescriptionService
{
    /**
     * Padrão exibido no boleto Cora: {Aluno}-{Curso}-Parcela {n}/{total}
     * Taxa de matrícula: {Aluno}-{Curso}-Taxa matricula
     */
    public function forInvoice(Invoice $invoice): string
    {
        $invoice->loadMissing([
            'enrollment.schoolClass.course',
            'enrollment.coursePlan.course',
            'enrollment.bundle',
            'student',
        ]);

        $enrollment = $invoice->enrollment;
        if (! $enrollment) {
            return trim((string) $invoice->description) !== ''
                ? (string) $invoice->description
                : 'Cobrança escolar';
        }

        return $this->forEnrollmentCharge(
            $enrollment,
            (string) $invoice->type,
            $invoice->due_date?->toDateString() ?? now()->toDateString()
        );
    }

    public function forEnrollmentCharge(Enrollment $enrollment, string $type, string $dueDate): string
    {
        $enrollment->loadMissing(['schoolClass.course', 'coursePlan.course', 'bundle', 'student']);

        $studentLabel = $this->formatStudentLabel((string) ($enrollment->student?->name ?? 'Aluno'));
        $courseLabel = $this->formatCourseLabel($this->resolveCourseName($enrollment));

        if ($type === 'enrollment_fee') {
            return "{$studentLabel}-{$courseLabel}-Taxa matricula";
        }

        if ($type === 'monthly') {
            [$current, $total] = $this->resolveMonthlyParcel($enrollment, $dueDate);

            return "{$studentLabel}-{$courseLabel}-Parcela {$current}/{$total}";
        }

        return trim("{$studentLabel}-{$courseLabel}") !== ''
            ? "{$studentLabel}-{$courseLabel}"
            : 'Cobrança escolar';
    }

    /**
     * @return array{0: int, 1: int}
     */
    public function resolveMonthlyParcel(Enrollment $enrollment, string $dueDate): array
    {
        $dueDate = Carbon::parse($dueDate)->toDateString();
        $schedule = $this->plannedMonthlyDueDates($enrollment);

        $index = array_search($dueDate, $schedule, true);
        if ($index !== false) {
            return [(int) $index + 1, max(count($schedule), 1)];
        }

        $existing = Invoice::query()
            ->where('enrollment_id', $enrollment->id)
            ->where('type', 'monthly')
            ->orderBy('due_date')
            ->pluck('due_date')
            ->map(fn ($d) => $d?->toDateString())
            ->filter()
            ->values()
            ->all();

        $index = array_search($dueDate, $existing, true);
        if ($index !== false) {
            return [(int) $index + 1, max(count($existing), 1)];
        }

        return [1, max(count($schedule), count($existing), 1)];
    }

    /**
     * @return list<string>
     */
    public function plannedMonthlyDueDates(Enrollment $enrollment): array
    {
        $enrollment->loadMissing(['coursePlan']);

        $plan = $enrollment->coursePlan;
        $tenant = $enrollment->tenant ?? Tenant::find($enrollment->tenant_id);
        $billing = $tenant
            ? app(TenantBillingSettingsService::class)->scope($tenant, 'billing')
            : [];

        $startDate = Carbon::parse($enrollment->start_date ?? now());
        $endDate = $enrollment->end_date
            ? Carbon::parse($enrollment->end_date)
            : $startDate->copy()->addMonths($plan?->monthsInCycle() ?? 1)->subDay();

        $dueDay = (int) ($enrollment->payment_due_day ?? $billing['default_payment_due_day'] ?? 10);

        $cursor = $startDate->copy()->day($dueDay);
        if ($cursor->lt($startDate)) {
            $cursor->addMonth();
        }

        if (
            ! empty($billing['charges_enrollment_fee'])
            && ! empty($billing['enrollment_fee_covers_first_month'])
        ) {
            $cursor->addMonth();
        }

        $dates = [];
        while ($cursor->lte($endDate)) {
            $dates[] = $cursor->toDateString();
            $cursor->addMonth();
        }

        return $dates;
    }

    private function resolveCourseName(Enrollment $enrollment): string
    {
        return (string) (
            $enrollment->schoolClass?->course?->name
            ?? $enrollment->coursePlan?->course?->name
            ?? $enrollment->bundle?->name
            ?? 'Curso'
        );
    }

    private function formatStudentLabel(string $name): string
    {
        $parts = preg_split('/\s+/u', trim($name)) ?: [];
        $meaningful = [];

        foreach ($parts as $part) {
            if ($part === '') {
                continue;
            }

            $lower = mb_strtolower($part, 'UTF-8');
            if (in_array($lower, ['de', 'da', 'do', 'dos', 'das', 'e'], true)) {
                continue;
            }

            $meaningful[] = mb_convert_case($lower, MB_CASE_TITLE, 'UTF-8');

            if (count($meaningful) >= 2) {
                break;
            }
        }

        if ($meaningful === []) {
            return mb_convert_case(trim($name), MB_CASE_TITLE, 'UTF-8');
        }

        return implode(' ', $meaningful);
    }

    private function formatCourseLabel(string $courseName): string
    {
        $normalized = trim($courseName);
        if ($normalized === '') {
            return 'curso';
        }

        $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $normalized);
        $ascii = is_string($ascii) ? $ascii : $normalized;
        $ascii = preg_replace('/[^a-zA-Z0-9]+/', '', $ascii) ?? $ascii;

        return strtolower($ascii !== '' ? $ascii : $normalized);
    }
}
