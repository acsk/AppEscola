<?php

namespace App\Services;

use App\Models\CourseBundle;
use App\Models\Enrollment;
use App\Models\Invoice;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class MergeDuplicateBundleEnrollmentsService
{
    /**
     * @return array{merged_groups: int, kept_enrollments: int, removed_enrollments: int, invoices_moved: int, invoices_dropped: int, details: list<array<string, mixed>>}
     */
    public function run(bool $dryRun = false, ?int $tenantId = null, ?int $studentId = null, ?int $bundleId = null): array
    {
        $summary = [
            'merged_groups' => 0,
            'kept_enrollments' => 0,
            'removed_enrollments' => 0,
            'invoices_moved' => 0,
            'invoices_dropped' => 0,
            'details' => [],
        ];

        foreach ($this->duplicateGroups($tenantId, $studentId, $bundleId) as $group) {
            $result = $this->mergeGroup($group, $dryRun);
            if ($result === null) {
                continue;
            }

            $summary['merged_groups']++;
            $summary['kept_enrollments']++;
            $summary['removed_enrollments'] += $result['removed'];
            $summary['invoices_moved'] += $result['invoices_moved'];
            $summary['invoices_dropped'] += $result['invoices_dropped'];
            $summary['details'][] = $result['detail'];
        }

        return $summary;
    }

    /**
     * @return Collection<int, Collection<int, Enrollment>>
     */
    private function duplicateGroups(?int $tenantId, ?int $studentId, ?int $bundleId): Collection
    {
        $query = Enrollment::query()
            ->whereNotNull('bundle_id')
            ->whereNotIn('status', ['cancelled'])
            ->with(['bundle', 'invoices', 'schoolClasses'])
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->when($studentId, fn ($q) => $q->where('student_id', $studentId))
            ->when($bundleId, fn ($q) => $q->where('bundle_id', $bundleId));

        return $query->get()
            ->groupBy(fn (Enrollment $e) => "{$e->tenant_id}:{$e->student_id}:{$e->bundle_id}")
            ->filter(fn (Collection $rows) => $rows->count() > 1)
            ->values();
    }

    /**
     * @param  Collection<int, Enrollment>  $group
     * @return array{removed: int, invoices_moved: int, invoices_dropped: int, detail: array<string, mixed>}|null
     */
    private function mergeGroup(Collection $group, bool $dryRun): ?array
    {
        /** @var Enrollment $keeper */
        $keeper = $this->selectKeeper($group);
        $duplicates = $group->filter(fn (Enrollment $e) => $e->id !== $keeper->id)->values();

        if ($duplicates->isEmpty()) {
            return null;
        }

        $bundle = $keeper->bundle ?? CourseBundle::find($keeper->bundle_id);
        if (! $bundle) {
            return null;
        }

        $classIds = $group
            ->flatMap(fn (Enrollment $e) => collect([$e->school_class_id])
                ->merge($e->schoolClasses->pluck('id')))
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        $invoicesMoved = 0;
        $invoicesDropped = 0;

        $detail = [
            'keeper_id' => $keeper->id,
            'keeper_number' => $keeper->enrollment_number,
            'removed_ids' => $duplicates->pluck('id')->all(),
            'school_class_ids' => $classIds,
            'bundle_id' => $keeper->bundle_id,
            'student_id' => $keeper->student_id,
        ];

        $chargesGeneratedAt = $group
            ->pluck('charges_generated_at')
            ->filter()
            ->sortDesc()
            ->first();

        $persist = ! $dryRun;

        $processInvoices = function () use ($keeper, $duplicates, $persist, &$invoicesMoved, &$invoicesDropped) {
            $keeper->refresh()->load(['invoices', 'schoolClasses']);
            $activeKeeperInvoices = $this->activeKeeperInvoices($keeper);

            foreach ($duplicates as $duplicate) {
                $duplicate->load('invoices');

                foreach ($duplicate->invoices as $invoice) {
                    $outcome = $this->applyInvoiceToKeeper(
                        $keeper,
                        $activeKeeperInvoices,
                        $invoice,
                        $persist
                    );

                    if ($outcome === 'moved') {
                        $invoicesMoved++;
                    } else {
                        $invoicesDropped++;
                    }
                }
            }
        };

        if ($dryRun) {
            $processInvoices();

            return [
                'removed' => $duplicates->count(),
                'invoices_moved' => $invoicesMoved,
                'invoices_dropped' => $invoicesDropped,
                'detail' => $detail,
            ];
        }

        DB::transaction(function () use ($keeper, $duplicates, $bundle, $classIds, $chargesGeneratedAt, $processInvoices) {
            $processInvoices();

            foreach ($duplicates as $duplicate) {
                $duplicate->schoolClasses()->detach();
                $duplicate->update(['status' => 'cancelled']);
                $duplicate->delete();
            }

            $keeper->update([
                'monthly_amount' => round($bundle->monthlyEquivalent(), 2),
                'school_class_id' => $classIds[0] ?? $keeper->school_class_id,
                'charges_generated_at' => $chargesGeneratedAt ?? $keeper->charges_generated_at,
            ]);

            $keeper->syncSchoolClasses($classIds);
        });

        return [
            'removed' => $duplicates->count(),
            'invoices_moved' => $invoicesMoved,
            'invoices_dropped' => $invoicesDropped,
            'detail' => $detail,
        ];
    }

    /**
     * @param  Collection<int, Invoice>  $activeKeeperInvoices
     * @return 'moved'|'dropped'
     */
    private function applyInvoiceToKeeper(
        Enrollment $keeper,
        Collection $activeKeeperInvoices,
        Invoice $invoice,
        bool $persist,
    ): string {
        $conflict = $this->findConflictingInCollection($activeKeeperInvoices, $invoice);

        if ($conflict) {
            if ($persist) {
                $this->reconcileDuplicateInvoice($conflict, $invoice);
                $invoice->delete();
            }

            return 'dropped';
        }

        if ($persist) {
            $invoice->update(['enrollment_id' => $keeper->id]);
            $activeKeeperInvoices->push($invoice->fresh());
        } else {
            $activeKeeperInvoices->push($invoice);
        }

        return 'moved';
    }

    /**
     * Matrícula que permanece: a que já gerou cobranças em lote; senão a de menor id (primeira criada).
     *
     * @param  Collection<int, Enrollment>  $group
     */
    private function selectKeeper(Collection $group): Enrollment
    {
        $withBatchCharges = $group->filter(fn (Enrollment $e) => $e->charges_generated_at !== null);

        if ($withBatchCharges->isNotEmpty()) {
            return $withBatchCharges
                ->sortBy(fn (Enrollment $e) => [
                    -$this->activeKeeperInvoices($e)->count(),
                    $e->id,
                ])
                ->first();
        }

        return $group->sortBy('id')->first();
    }

    /**
     * @param  Collection<int, Invoice>  $activeInvoices
     */
    private function findConflictingInCollection(Collection $activeInvoices, Invoice $invoice): ?Invoice
    {
        $dueDate = $invoice->due_date?->toDateString();

        return $activeInvoices->first(
            fn (Invoice $existing) => ! $existing->trashed()
                && $existing->type === $invoice->type
                && $existing->due_date?->toDateString() === $dueDate
        );
    }

    /**
     * Apenas cobranças ativas da matrícula mantida (ignora soft-deleted).
     *
     * @return Collection<int, Invoice>
     */
    private function activeKeeperInvoices(Enrollment $keeper): Collection
    {
        if ($keeper->relationLoaded('invoices')) {
            return $keeper->invoices->filter(fn (Invoice $inv) => ! $inv->trashed())->values();
        }

        return $keeper->invoices()->get();
    }

    private function reconcileDuplicateInvoice(Invoice $keeperInvoice, Invoice $duplicateInvoice): void
    {
        if (! $this->shouldPreferInvoice($keeperInvoice, $duplicateInvoice)) {
            return;
        }

        $keeperInvoice->update([
            'amount' => $duplicateInvoice->amount,
            'status' => $duplicateInvoice->status,
            'paid_at' => $duplicateInvoice->paid_at ?? $keeperInvoice->paid_at,
            'payment_method' => $duplicateInvoice->payment_method ?? $keeperInvoice->payment_method,
            'payment_reference' => $duplicateInvoice->payment_reference ?? $keeperInvoice->payment_reference,
            'notes' => $duplicateInvoice->notes ?? $keeperInvoice->notes,
            'cora_charge_id' => $duplicateInvoice->cora_charge_id ?? $keeperInvoice->cora_charge_id,
            'cora_status' => $duplicateInvoice->cora_status ?? $keeperInvoice->cora_status,
            'cora_payment_url' => $duplicateInvoice->cora_payment_url ?? $keeperInvoice->cora_payment_url,
            'cora_pix_copy_paste' => $duplicateInvoice->cora_pix_copy_paste ?? $keeperInvoice->cora_pix_copy_paste,
            'boleto_number' => $duplicateInvoice->boleto_number ?? $keeperInvoice->boleto_number,
            'boleto_digitable' => $duplicateInvoice->boleto_digitable ?? $keeperInvoice->boleto_digitable,
            'cora_payload' => $duplicateInvoice->cora_payload ?? $keeperInvoice->cora_payload,
            'cora_last_synced_at' => $duplicateInvoice->cora_last_synced_at ?? $keeperInvoice->cora_last_synced_at,
        ]);
    }

    private function shouldPreferInvoice(Invoice $keeper, Invoice $other): bool
    {
        if ($other->status === 'paid' && $keeper->status !== 'paid') {
            return true;
        }

        if (! empty($other->cora_charge_id) && empty($keeper->cora_charge_id)) {
            return true;
        }

        return false;
    }
}
