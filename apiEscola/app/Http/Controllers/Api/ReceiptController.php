<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReceiptController extends Controller
{
    /**
     * Retorna o recibo de uma invoice paga — acesso admin/painel.
     *
     * GET /api/invoices/{invoice}/receipt
     */
    public function show(Request $request, Invoice $invoice): JsonResponse
    {
        $user = $request->user();

        if ((int) $invoice->tenant_id !== (int) $user->tenant_id) {
            return $this->forbidden('Recibo não pertence ao tenant autenticado.');
        }

        if ($invoice->status !== 'paid') {
            return $this->error('Recibo disponível apenas para cobranças pagas.', null, 422);
        }

        $invoice->loadMissing(['tenant', 'student', 'guardian', 'enrollment.schoolClass']);

        return $this->success(
            $this->buildReceiptPayload($invoice),
            'Recibo gerado com sucesso.'
        );
    }

    /**
     * Retorna o recibo de uma invoice paga — acesso do aluno autenticado.
     *
     * GET /api/aluno/cobrancas/{invoice}/receipt
     */
    public function aluno(Request $request, Invoice $invoice): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return $this->forbidden('Este endpoint é exclusivo para alunos.');
        }

        $student = Student::query()
            ->where('user_id', $user->id)
            ->where('tenant_id', $user->tenant_id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return $this->forbidden('Aluno não encontrado ou inativo.');
        }

        if ((int) $invoice->tenant_id !== (int) $user->tenant_id
            || (int) $invoice->student_id !== (int) $student->id
        ) {
            return $this->forbidden('Cobrança não pertence ao aluno autenticado.');
        }

        if ($invoice->status !== 'paid') {
            return $this->error('Recibo disponível apenas para cobranças pagas.', null, 422);
        }

        $invoice->loadMissing(['tenant', 'student', 'guardian', 'enrollment.schoolClass']);

        return $this->success(
            $this->buildReceiptPayload($invoice),
            'Recibo gerado com sucesso.'
        );
    }

    // -----------------------------------------------------------------------
    // Helpers privados
    // -----------------------------------------------------------------------

    private function buildReceiptPayload(Invoice $invoice): array
    {
        $tenant = $invoice->relationLoaded('tenant') ? $invoice->tenant : null;
        $student = $invoice->relationLoaded('student') ? $invoice->student : null;
        $guardian = $invoice->relationLoaded('guardian') ? $invoice->guardian : null;
        $enrollment = $invoice->relationLoaded('enrollment') ? $invoice->enrollment : null;
        $schoolClass = $enrollment?->relationLoaded('schoolClass') ? $enrollment->schoolClass : null;

        $payerName = $guardian?->name ?? $student?->name ?? '—';
        $payerDocument = $this->formatDocument($guardian?->document ?? $student?->document ?? '');

        return [
            'receipt_number'  => $this->buildReceiptNumber($invoice),
            'receipt_hash'    => $this->buildReceiptHash($invoice),
            'issued_at'       => now()->toISOString(),

            'school' => [
                'name'         => $tenant?->trade_name ?? $tenant?->name ?? '—',
                'corporate_name' => $tenant?->corporate_name,
                'cnpj'         => $this->formatCnpj($tenant?->cnpj ?? ''),
                'email'        => $tenant?->email,
                'phone'        => $tenant?->phone,
                'logo_url'     => $tenant?->photo_url,
                'address'      => $this->buildAddress($tenant),
            ],

            'student' => [
                'name'     => $student?->name ?? '—',
                'document' => $this->formatDocument($student?->document ?? ''),
                'email'    => $student?->email,
                'phone'    => $student?->phone,
            ],

            'payer' => [
                'name'         => $payerName,
                'document'     => $payerDocument,
                'is_guardian'  => $guardian !== null,
                'guardian_name' => $guardian?->name,
            ],

            'enrollment' => $enrollment ? [
                'id'                => $enrollment->id,
                'enrollment_number' => $enrollment->enrollment_number,
                'school_class'      => $schoolClass?->name,
                'start_date'        => $enrollment->start_date?->toDateString(),
                'end_date'          => $enrollment->end_date?->toDateString(),
            ] : null,

            'invoice' => [
                'id'             => $invoice->id,
                'description'    => $invoice->description,
                'type'           => $invoice->type,
                'amount'         => number_format((float) $invoice->amount, 2, ',', '.'),
                'amount_raw'     => (float) $invoice->amount,
                'due_date'       => $invoice->due_date?->toDateString(),
                'paid_at'        => $invoice->paid_at?->toISOString(),
                'paid_at_date'   => $invoice->paid_at?->toDateString(),
                'paid_at_time'   => $invoice->paid_at?->format('H:i'),
                'payment_method' => $this->labelPaymentMethod($invoice->payment_method),
                'payment_method_slug' => $invoice->payment_method,
                'cora_charge_id' => $invoice->cora_charge_id,
                'notes'          => $invoice->notes,
            ],

            'verification' => [
                'message' => 'Este documento é um comprovante eletrônico de pagamento.',
                'verify_hash' => $this->buildReceiptHash($invoice),
            ],
        ];
    }

    private function buildReceiptNumber(Invoice $invoice): string
    {
        // Formato: REC-{ano}-{invoice_id padded 6}
        $year = $invoice->paid_at?->year ?? now()->year;

        return sprintf('REC-%d-%06d', $year, $invoice->id);
    }

    private function buildReceiptHash(Invoice $invoice): string
    {
        // Hash determinístico baseado em dados imutáveis da invoice para verificação.
        $raw = implode('|', [
            $invoice->id,
            $invoice->tenant_id,
            $invoice->student_id,
            $invoice->amount,
            $invoice->paid_at?->toDateTimeString() ?? '',
            $invoice->payment_method ?? '',
        ]);

        return hash('sha256', $raw);
    }

    private function buildAddress(?object $tenant): ?string
    {
        if (! $tenant) {
            return null;
        }

        $parts = array_filter([
            $tenant->street ?? null,
            $tenant->number ? 'n° ' . $tenant->number : null,
            $tenant->complement ?? null,
            $tenant->neighborhood ?? null,
            $tenant->city && $tenant->state
                ? $tenant->city . '/' . $tenant->state
                : ($tenant->city ?? $tenant->state ?? null),
        ]);

        return $parts ? implode(', ', $parts) : null;
    }

    private function formatDocument(string $doc): string
    {
        $digits = preg_replace('/\D/', '', $doc);

        if (strlen($digits) === 11) {
            return preg_replace('/(\d{3})(\d{3})(\d{3})(\d{2})/', '$1.$2.$3-$4', $digits);
        }

        if (strlen($digits) === 14) {
            return $this->formatCnpj($digits);
        }

        return $doc;
    }

    private function formatCnpj(string $cnpj): string
    {
        $digits = preg_replace('/\D/', '', $cnpj);

        if (strlen($digits) === 14) {
            return preg_replace('/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/', '$1.$2.$3/$4-$5', $digits);
        }

        return $cnpj;
    }

    private function labelPaymentMethod(?string $method): string
    {
        return match ($method) {
            'pix'       => 'PIX',
            'bank_slip', 'boleto' => 'Boleto Bancário',
            'credit_card' => 'Cartão de Crédito',
            'cash'      => 'Dinheiro',
            'transfer'  => 'Transferência Bancária',
            default     => $method ?? '—',
        };
    }
}
