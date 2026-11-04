<?php

namespace App\Services\Cora;

use App\Support\BusinessDate;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * Data do pagamento numa cobrança consultada na Cora. Mesma ordem de campos usada até aqui
 * (occurrence_date = dia em que o pagador pagou no banco); só corrige o fuso: data sem horário é
 * o dia em Brasília, não meia-noite UTC.
 */
final class CoraPaymentDate
{
    /** @param  array<string, mixed>  $external */
    public static function fromInvoice(array $external): ?Carbon
    {
        $candidates = [
            $external['paid_at'] ?? null,
            $external['occurrence_date'] ?? null,
            data_get($external, 'payment.paid_at'),
            data_get($external, 'payment_date'),
            data_get($external, 'paidAt'),
            data_get($external, 'payments.0.finalized_at'),
            data_get($external, 'payments.0.created_at'),
        ];

        foreach ($candidates as $candidate) {
            if (! is_string($candidate) || trim($candidate) === '') {
                continue;
            }

            try {
                return BusinessDate::moment($candidate);
            } catch (Throwable) {
                continue;
            }
        }

        return null;
    }
}
