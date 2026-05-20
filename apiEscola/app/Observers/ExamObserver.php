<?php

namespace App\Observers;

use App\Models\Exam;
use App\Services\ExamCalendarSyncService;

class ExamObserver
{
    public function __construct(
        private readonly ExamCalendarSyncService $calendarSync,
    ) {}

    public function saved(Exam $exam): void
    {
        $this->calendarSync->sync($exam);
    }

    public function deleted(Exam $exam): void
    {
        $this->calendarSync->remove($exam);
    }
}
