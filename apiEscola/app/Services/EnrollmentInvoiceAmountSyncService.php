<?php

namespace App\Services;

use App\Models\CoursePlan;
use App\Models\Enrollment;
use App\Models\Invoice;

class EnrollmentInvoiceAmountSyncService
{
    /**
     * Atualiza cobranças locais pendentes/vencidas quando o desconto ou a base da matrícula mudam.
     */
    public function syncPendingInvoices(Enrollment $enrollment): int
    {
        $updated = $this->syncPendingMonthlyInvoices($enrollment);

        $plan = $enrollment->coursePlan;
        if ($plan) {
            $updated += $this->syncPendingEnrollmentFee($enrollment, $plan);
        }

        return $updated;
    }

    public function syncPendingMonthlyInvoices(Enrollment $enrollment): int
    {
        $netAmount = $enrollment->netMonthlyAmount();

        return Invoice::query()
            ->where('enrollment_id', $enrollment->id)
            ->where('type', 'monthly')
            ->whereIn('status', ['pending', 'overdue'])
            ->where('amount', '!=', $netAmount)
            ->update(['amount' => $netAmount]);
    }

    private function syncPendingEnrollmentFee(Enrollment $enrollment, CoursePlan $plan): int
    {
        $planFee = $plan->enrollment_fee_amount;
        if ($planFee === null) {
            return 0;
        }

        $netFee = max((float) $planFee - (float) ($enrollment->discount_amount ?? 0), 0);
        if ($netFee <= 0) {
            return 0;
        }

        return Invoice::query()
            ->where('enrollment_id', $enrollment->id)
            ->where('type', 'enrollment_fee')
            ->whereIn('status', ['pending', 'overdue'])
            ->where('amount', '!=', $netFee)
            ->update(['amount' => $netFee]);
    }
}
