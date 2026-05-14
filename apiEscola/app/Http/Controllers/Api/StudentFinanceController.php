<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Student;
use App\Services\CoraPaymentService;
use Carbon\Carbon;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentFinanceController extends Controller
{
    /**
    * Lista cobrancas do aluno autenticado em 3 grupos:
    * - pagas: cobrancas com status paid
    * - atrasadas: cobrancas em aberto com vencimento anterior a hoje
    * - atual: apenas a cobranca vigente do mes atual (mais proxima de hoje)
     */
    public function boletos(Request $request): JsonResponse
    {
        [$user, $student, $error] = $this->resolveAlunoAndStudent($request);
        if ($error) {
            return $error;
        }

        $today = Carbon::today();
        $startOfMonth = $today->copy()->startOfMonth();
        $endOfMonth = $today->copy()->endOfMonth();

        $baseQuery = Invoice::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('student_id', $student->id);

        $pagas = (clone $baseQuery)
            ->where('status', 'paid')
            ->orderByDesc('paid_at')
            ->orderByDesc('due_date')
            ->get();

        $atrasados = (clone $baseQuery)
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->whereDate('due_date', '<', $today->toDateString())
            ->orderBy('due_date')
            ->get();

        $atual = (clone $baseQuery)
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->whereBetween('due_date', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
            ->whereDate('due_date', '>=', $today->toDateString())
            ->orderBy('due_date')
            ->first();

        return $this->success([
            'student_id' => $student->id,
            'referencia' => [
                'hoje' => $today->toDateString(),
                'inicio_mes' => $startOfMonth->toDateString(),
                'fim_mes' => $endOfMonth->toDateString(),
            ],
            'pagas' => $pagas->map(fn (Invoice $invoice) => $this->mapBoleto($invoice))->values(),
            'atrasados' => $atrasados->map(fn (Invoice $invoice) => $this->mapBoleto($invoice))->values(),
            'atual' => $atual ? $this->mapBoleto($atual) : null,
            'resumo' => [
                'quantidade_pagas' => $pagas->count(),
                'quantidade_atrasados' => $atrasados->count(),
                'possui_atual' => (bool) $atual,
                'valor_total_pagas' => $pagas->sum('amount'),
                'valor_total_atrasados' => $atrasados->sum('amount'),
                'valor_atual' => $atual?->amount,
            ],
        ], 'Cobrancas carregadas com sucesso.');
    }

    public function paymentOptions(Request $request, Invoice $invoice): JsonResponse
    {
        [$user, $student, $error] = $this->resolveAlunoAndStudent($request);
        if ($error) {
            return $error;
        }

        if (! $this->canAccessInvoice($invoice, $user->tenant_id, $student->id)) {
            return $this->forbidden('Cobrança não pertence ao aluno autenticado.');
        }

        return $this->success([
            'invoice' => $this->mapBoleto($invoice),
            'allowed_methods' => ['pix', 'boleto'],
            'current_method' => in_array($invoice->payment_method, ['pix', 'bank_slip', 'boleto'], true)
                ? ($invoice->payment_method === 'bank_slip' ? 'boleto' : $invoice->payment_method)
                : null,
            'actions' => [
                'can_generate_charge' => ! in_array($invoice->status, ['paid', 'cancelled'], true),
                'can_open_boleto_url' => (bool) $invoice->cora_payment_url,
                'can_copy_boleto_line' => (bool) $invoice->boleto_digitable,
                'can_copy_pix_code' => (bool) $invoice->cora_pix_copy_paste,
            ],
            'payment_assets' => [
                'boleto_number' => $invoice->boleto_number,
                'boleto_digitable' => $invoice->boleto_digitable,
                'boleto_url' => $invoice->cora_payment_url,
                'pix_copy_paste' => $invoice->cora_pix_copy_paste,
                'pix_qr_image_url' => data_get($invoice->cora_payload, 'pix.qr_code_image_url')
                    ?? data_get($invoice->cora_payload, 'pix.qr_code_url')
                    ?? data_get($invoice->cora_payload, 'payment_options.pix.qr_code_url'),
            ],
        ], 'Opções de pagamento carregadas com sucesso.');
    }

    public function generateCharge(Request $request, Invoice $invoice, CoraPaymentService $cora): JsonResponse
    {
        [$user, $student, $error] = $this->resolveAlunoAndStudent($request);
        if ($error) {
            return $error;
        }

        if (! $this->canAccessInvoice($invoice, $user->tenant_id, $student->id)) {
            return $this->forbidden('Cobrança não pertence ao aluno autenticado.');
        }

        $data = $request->validate([
            'method' => ['required', 'string', 'in:pix,boleto,bank_slip'],
            'environment' => ['nullable', 'string', 'in:stage,prod,production'],
        ]);

        if (in_array($invoice->status, ['paid', 'cancelled'], true)) {
            return $this->error('Não é possível gerar cobrança para fatura paga ou cancelada.', null, 422);
        }

        // Enforce environment: outside production always stage; in production always prod
        $environment = app()->environment('production') ? 'prod' : 'stage';

        $requestedMethod = strtolower((string) $data['method']);
        $coraMethod = in_array($requestedMethod, ['boleto', 'bank_slip'], true) ? 'boleto' : 'pix';
        $storedMethod = $coraMethod === 'boleto' ? 'bank_slip' : 'pix';

        if ($this->shouldReuseExistingCharge($invoice, $storedMethod)) {
            return $this->success(
                $this->buildChargeResponsePayload($invoice, $coraMethod, true),
                'Cobrança existente reutilizada com sucesso.'
            );
        }

        try {
            $result = $cora->createCharge($invoice, $environment, $coraMethod);
        } catch (ConnectionException|RequestException $e) {
            return $this->error('Erro ao comunicar com o provedor.', [
                'error' => $e->getMessage(),
            ], 502);
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        $invoice->update([
            'payment_method' => $storedMethod,
            'cora_charge_id' => $result['external_id'],
            'cora_status' => $result['status'],
            'cora_payment_url' => $result['payment_url'],
            'cora_pix_copy_paste' => $result['pix_copy_paste'],
            'boleto_number' => $result['boleto_number'],
            'boleto_digitable' => $result['boleto_digitable'],
            'cora_payload' => $result['payload'],
            'cora_last_synced_at' => now(),
        ]);

        $invoice->refresh();

        return $this->success(
            $this->buildChargeResponsePayload($invoice, $coraMethod, false, $result['qr_code_image_url'] ?? null),
            'Cobrança gerada com sucesso.'
        );
    }

    private function resolveAlunoAndStudent(Request $request): array
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return [$user, null, $this->forbidden('Este endpoint é exclusivo para alunos.')];
        }

        $student = Student::query()
            ->where('user_id', $user->id)
            ->where('tenant_id', $user->tenant_id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return [$user, null, $this->forbidden('Aluno não encontrado ou inativo.')];
        }

        return [$user, $student, null];
    }

    private function canAccessInvoice(Invoice $invoice, int $tenantId, int $studentId): bool
    {
        return (int) $invoice->tenant_id === (int) $tenantId
            && (int) $invoice->student_id === (int) $studentId;
    }

    private function shouldReuseExistingCharge(Invoice $invoice, string $storedMethod): bool
    {
        if ($invoice->payment_method !== $storedMethod) {
            return false;
        }

        if (! $invoice->cora_charge_id || ! in_array($invoice->cora_status, ['OPEN', 'PENDING'], true)) {
            return false;
        }

        if ($storedMethod === 'pix') {
            return (bool) $invoice->cora_pix_copy_paste;
        }

        return (bool) ($invoice->boleto_digitable || $invoice->boleto_number || $invoice->cora_payment_url);
    }

    private function buildChargeResponsePayload(
        Invoice $invoice,
        string $method,
        bool $reusedExistingCharge,
        ?string $pixQrImageUrl = null
    ): array {
        return [
            'invoice_id' => $invoice->id,
            'method' => $method,
            'status' => $invoice->cora_status,
            'reused_existing_charge' => $reusedExistingCharge,
            'charge_id' => $invoice->cora_charge_id,
            'payment_assets' => [
                'boleto_number' => $invoice->boleto_number,
                'boleto_digitable' => $invoice->boleto_digitable,
                'boleto_url' => $invoice->cora_payment_url,
                'pix_copy_paste' => $invoice->cora_pix_copy_paste,
                'pix_qr_image_url' => $pixQrImageUrl
                    ?? data_get($invoice->cora_payload, 'pix.qr_code_image_url')
                    ?? data_get($invoice->cora_payload, 'pix.qr_code_url')
                    ?? data_get($invoice->cora_payload, 'payment_options.pix.qr_code_url'),
            ],
            'actions' => [
                'can_open_boleto_url' => (bool) $invoice->cora_payment_url,
                'can_copy_boleto_line' => (bool) $invoice->boleto_digitable,
                'can_copy_pix_code' => (bool) $invoice->cora_pix_copy_paste,
            ],
        ];
    }

    private function mapBoleto(Invoice $invoice): array
    {
        return [
            'id' => $invoice->id,
            'enrollment_id' => $invoice->enrollment_id,
            'description' => $invoice->description,
            'amount' => (string) $invoice->amount,
            'due_date' => $invoice->due_date?->toDateString(),
            'status' => $invoice->status,
            'payment_method' => $invoice->payment_method,
            'boleto_number' => $invoice->boleto_number,
            'boleto_digitable' => $invoice->boleto_digitable,
            'payment_url' => $invoice->cora_payment_url,
            'pix_copy_paste' => $invoice->cora_pix_copy_paste,
            'pix_qr_image_url' => data_get($invoice->cora_payload, 'pix.qr_code_image_url')
                ?? data_get($invoice->cora_payload, 'pix.qr_code_url')
                ?? data_get($invoice->cora_payload, 'payment_options.pix.qr_code_url'),
            'is_overdue' => $invoice->due_date?->isBefore(Carbon::today()) ?? false,
        ];
    }
}
