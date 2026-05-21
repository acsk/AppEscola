<?php

namespace App\Services\Asaas;

class AsaasPaymentStatusMapper
{
    /** Status Asaas que indicam pagamento confirmado. */
    private const PAID_STATUSES = [
        'RECEIVED',
        'CONFIRMED',
        'RECEIVED_IN_CASH',
    ];

    private const CANCELLED_STATUSES = [
        'DELETED',
        'REFUNDED',
        'CANCELED',
        'CANCELLED',
    ];

    public function mapToLocalStatus(string $asaasStatus): string
    {
        $status = strtoupper(trim($asaasStatus));

        if (in_array($status, self::PAID_STATUSES, true)) {
            return 'paid';
        }

        if ($status === 'OVERDUE') {
            return 'overdue';
        }

        if (in_array($status, self::CANCELLED_STATUSES, true)) {
            return 'cancelled';
        }

        return 'pending';
    }

    public function isPaidStatus(string $asaasStatus): bool
    {
        return $this->mapToLocalStatus($asaasStatus) === 'paid';
    }

    public function isCancelledStatus(string $asaasStatus): bool
    {
        return in_array(strtoupper(trim($asaasStatus)), self::CANCELLED_STATUSES, true);
    }

    /**
     * @return array<int, string>
     */
    public function cancelledStatuses(): array
    {
        return self::CANCELLED_STATUSES;
    }
}
