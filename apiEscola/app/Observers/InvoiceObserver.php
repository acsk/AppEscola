<?php

namespace App\Observers;

use App\Models\Invoice;
use App\Services\InvoiceCalendarSyncService;

class InvoiceObserver
{
    public function __construct(
        private readonly InvoiceCalendarSyncService $calendarSync,
    ) {}

    public function saved(Invoice $invoice): void
    {
        $this->calendarSync->sync($invoice);
    }

    public function deleted(Invoice $invoice): void
    {
        $this->calendarSync->remove($invoice);
    }
}
