<?php

namespace App\Jobs;

use App\Models\Enrollment;
use App\Services\CoraEnrollmentInvoiceSyncService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SyncEnrollmentCoraChargesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * @param array<int, string> $chargeIds
     */
    public function __construct(
        public readonly int $enrollmentId,
        public readonly string $environment = 'prod',
        public readonly array $chargeIds = [],
        public readonly bool $createMissing = true,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function handle(CoraEnrollmentInvoiceSyncService $syncService): array
    {
        $enrollment = Enrollment::query()->findOrFail($this->enrollmentId);

        return $syncService->syncEnrollmentCharges(
            enrollment: $enrollment,
            environment: $this->environment,
            chargeIds: $this->chargeIds,
            createMissing: $this->createMissing,
        );
    }
}
