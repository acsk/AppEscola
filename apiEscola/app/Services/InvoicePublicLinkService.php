<?php

namespace App\Services;

use App\Models\Invoice;

/**
 * Link público de pagamento de uma cobrança (boleto e PIX copia e cola), para enviar ao aluno.
 * A assinatura HMAC impede trocar o id na URL e abrir cobranças de outros alunos.
 */
class InvoicePublicLinkService
{
    public function url(Invoice $invoice): string
    {
        return route('public.invoice-payment', [
            'invoice' => $invoice->id,
            'signature' => $this->signature((int) $invoice->id),
        ]);
    }

    public function resolve(int $invoiceId, string $signature): ?Invoice
    {
        if (! hash_equals($this->signature($invoiceId), $signature)) {
            return null;
        }

        return Invoice::query()->with(['tenant:id,name', 'student:id,name'])->find($invoiceId);
    }

    private function signature(int $invoiceId): string
    {
        return substr(hash_hmac('sha256', 'invoice-payment:'.$invoiceId, (string) config('app.key')), 0, 32);
    }
}
