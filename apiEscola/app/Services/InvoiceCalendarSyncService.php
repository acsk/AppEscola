<?php

namespace App\Services;

use App\Models\CalendarEvent;
use App\Models\Invoice;
use Illuminate\Support\Carbon;

class InvoiceCalendarSyncService
{
    /**
     * Statuses that should not appear on the student calendar.
     *
     * @var list<string>
     */
    private const HIDDEN_STATUSES = ['paid', 'cancelled'];

    public function sync(Invoice $invoice): void
    {
        $invoice->loadMissing(['enrollment.coursePlan', 'enrollment.schoolClass']);

        if (! $invoice->due_date || ! $invoice->student_id) {
            $this->remove($invoice);

            return;
        }

        if (in_array($invoice->status, self::HIDDEN_STATUSES, true)) {
            $this->remove($invoice);

            return;
        }

        $dueDate = Carbon::parse($invoice->due_date);
        $startsAt = $dueDate->copy()->startOfDay();
        $endsAt = $dueDate->copy()->endOfDay();

        $amount = number_format((float) $invoice->amount, 2, ',', '.');
        $title = $invoice->description
            ? trim($invoice->description)
            : 'Cobrança com vencimento';

        $description = "Valor: R$ {$amount}";
        if ($invoice->type) {
            $description .= "\nTipo: {$invoice->type}";
        }

        $courseId = $this->resolveCourseId($invoice);

        CalendarEvent::updateOrCreate(
            [
                'source_type' => 'invoice',
                'source_id'   => $invoice->id,
            ],
            [
                'tenant_id'       => $invoice->tenant_id,
                'type'            => 'billing',
                'title'           => $title,
                'description'     => $description,
                'starts_at'       => $startsAt,
                'ends_at'         => $endsAt,
                'all_day'         => true,
                'course_id'       => $courseId,
                'school_class_id' => $invoice->enrollment?->school_class_id,
                'student_id'      => $invoice->student_id,
                'location'        => null,
                'audience_type'   => 'student',
                'audience_params' => ['student_id' => $invoice->student_id],
                'is_published'    => true,
                'updated_by'      => $invoice->updated_by,
                'created_by'      => $invoice->created_by,
            ]
        );
    }

    public function remove(Invoice $invoice): void
    {
        CalendarEvent::query()
            ->where('source_type', 'invoice')
            ->where('source_id', $invoice->id)
            ->delete();
    }

    private function resolveCourseId(Invoice $invoice): ?int
    {
        $enrollment = $invoice->enrollment;

        if (! $enrollment) {
            return null;
        }

        if ($enrollment->coursePlan?->course_id) {
            return (int) $enrollment->coursePlan->course_id;
        }

        if ($enrollment->schoolClass?->course_id) {
            return (int) $enrollment->schoolClass->course_id;
        }

        return null;
    }
}
