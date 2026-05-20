<?php

namespace App\Services;

use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Request;
use RuntimeException;

class InvoiceSettlementService
{
    public const CARD_METHODS_REQUIRING_REFERENCE = ['credit_card'];

    public function __construct(private readonly InvoiceLifecycleService $lifecycle)
    {
    }

    public function requiresPaymentReference(?string $paymentMethod): bool
    {
        return in_array($paymentMethod, self::CARD_METHODS_REQUIRING_REFERENCE, true);
    }

    /**
     * @param  array{paid_at?: mixed, payment_method: string, payment_reference?: ?string, notes?: ?string, environment?: ?string}  $data
     * @return array{invoice: Invoice, cancelled_on_gateway: bool}
     */
    public function settle(Invoice $invoice, array $data, ?Request $request = null): array
    {
        if ($invoice->status === 'paid') {
            throw new RuntimeException('Cobrança já está paga.');
        }

        if ($invoice->status === 'cancelled') {
            throw new RuntimeException('Não é possível dar baixa em uma cobrança cancelada.');
        }

        $request = $request ?? request();
        $cancelledOnGateway = false;

        if ($this->lifecycle->shouldCancelOnGateway($invoice)) {
            try {
                $cancelledOnGateway = $this->lifecycle->invalidateGatewayChargeBeforeSettlement($invoice, $request);
                $invoice->refresh();
            } catch (ConnectionException $e) {
                throw new RuntimeException(
                    'Não foi possível cancelar a cobrança no provedor antes da baixa. Tente novamente.',
                    0,
                    $e
                );
            } catch (RequestException $e) {
                throw new RuntimeException(
                    'O provedor recusou o cancelamento da cobrança. A baixa não foi registrada.',
                    0,
                    $e
                );
            }
        }

        $paymentMethod = (string) $data['payment_method'];
        $paymentReference = isset($data['payment_reference'])
            ? trim((string) $data['payment_reference'])
            : null;

        if ($this->requiresPaymentReference($paymentMethod) && $paymentReference === '') {
            throw new RuntimeException('Informe o identificador da transação no cartão de crédito.');
        }

        $paidAt = $data['paid_at'] ?? now();
        if (! $paidAt instanceof Carbon) {
            $paidAt = Carbon::parse($paidAt);
        }

        $invoice->update([
            'status' => 'paid',
            'paid_at' => $paidAt,
            'payment_method' => $paymentMethod,
            'payment_reference' => $paymentReference !== '' ? $paymentReference : null,
            'notes' => $data['notes'] ?? $invoice->notes,
        ]);

        return [
            'invoice' => $invoice->fresh(),
            'cancelled_on_gateway' => $cancelledOnGateway,
        ];
    }

    public function settlementHint(Invoice $invoice): ?string
    {
        if ($invoice->status === 'paid' || $invoice->status === 'cancelled') {
            return null;
        }

        if ($this->lifecycle->shouldCancelOnGateway($invoice)) {
            return 'Esta cobrança possui boleto ativo na Cora. Ao registrar a baixa manual, o boleto será cancelado no provedor e a forma de pagamento será atualizada.';
        }

        if ($this->lifecycle->isPixOnlyActiveCharge($invoice)) {
            return 'Há um PIX ativo na Cora. A baixa manual registra o pagamento no sistema; o PIX no provedor expira automaticamente.';
        }

        if (! $invoice->cora_charge_id) {
            return 'Cobrança apenas local: a baixa manual não envia nada ao provedor.';
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    public function summary(\Illuminate\Database\Eloquent\Builder $query, ?string $paidAtFrom, ?string $paidAtTo): array
    {
        $base = clone $query;

        $openStatuses = ['pending', 'overdue'];
        $openQuery = (clone $base)->whereIn('status', $openStatuses);
        $overdueQuery = (clone $base)->where('status', 'overdue');

        $paidQuery = (clone $base)->where('status', 'paid');
        if ($paidAtFrom) {
            $paidQuery->whereDate('paid_at', '>=', $paidAtFrom);
        }
        if ($paidAtTo) {
            $paidQuery->whereDate('paid_at', '<=', $paidAtTo);
        }

        $byMethod = (clone $paidQuery)
            ->whereNotNull('payment_method')
            ->selectRaw('payment_method, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount')
            ->groupBy('payment_method')
            ->orderByDesc('total_amount')
            ->get()
            ->map(fn ($row) => [
                'payment_method' => $row->payment_method,
                'count' => (int) $row->count,
                'amount' => number_format((float) $row->total_amount, 2, '.', ''),
            ])
            ->values()
            ->all();

        return [
            'open' => $this->aggregateTotals($openQuery),
            'overdue' => $this->aggregateTotals($overdueQuery),
            'paid_in_period' => $this->aggregateTotals($paidQuery),
            'by_payment_method' => $byMethod,
            'period' => [
                'paid_at_from' => $paidAtFrom,
                'paid_at_to' => $paidAtTo,
            ],
        ];
    }

    /**
     * @return array{count: int, amount: string}
     */
    private function aggregateTotals(\Illuminate\Database\Eloquent\Builder $query): array
    {
        $row = $query->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount')->first();

        return [
            'count' => (int) ($row->count ?? 0),
            'amount' => number_format((float) ($row->total_amount ?? 0), 2, '.', ''),
        ];
    }
}
