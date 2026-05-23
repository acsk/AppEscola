<?php

namespace App\Services;

use App\Exceptions\CarneGenerationException;
use App\Models\Enrollment;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class EnrollmentCarneService
{
    public function __construct(
        private readonly InvoiceGatewayChargeService $chargeService,
        private readonly InvoiceCoraChargeAssetsService $chargeAssets,
        private readonly PdfMergeService $pdfMerge,
    ) {
    }

    /**
     * @param  array<int>|null  $invoiceIds
     * @return array<string, mixed>
     */
    public function preview(Enrollment $enrollment, ?array $invoiceIds = null): array
    {
        $enrollment->loadMissing('student');
        $all = $this->enrollmentInvoices($enrollment);
        $eligible = collect();
        $excluded = collect();

        foreach ($all as $invoice) {
            $ineligibility = $this->classifyIneligibility($invoice);
            if ($ineligibility !== null) {
                $excluded->push($this->excludedInvoiceRow($invoice, $ineligibility));

                continue;
            }

            if ($invoiceIds !== null && $invoiceIds !== [] && ! in_array($invoice->id, $invoiceIds, true)) {
                continue;
            }

            $eligible->push($invoice);
        }

        $archiveFormat = $this->pdfMerge->defaultArchiveFormat();

        return [
            'enrollment_id' => $enrollment->id,
            'enrollment_number' => $enrollment->enrollment_number,
            'student_name' => $enrollment->student?->name,
            'total_invoices' => $all->count(),
            'eligible_count' => $eligible->count(),
            'excluded_count' => $excluded->count(),
            'archive_format' => $archiveFormat,
            'archive_format_hint' => $archiveFormat === 'pdf'
                ? 'Um único PDF com todos os boletos em sequência.'
                : 'Arquivo ZIP com um PDF por parcela (ideal para imprimir todos).',
            'ready_for_bundle_count' => $eligible
                ->filter(fn (Invoice $invoice) => $this->chargeAssets->hasBoletoAssets(
                    $this->chargeAssets->paymentAssetsFromInvoice($invoice)
                ))
                ->count(),
            'invoices' => $eligible->map(fn (Invoice $invoice) => $this->invoiceRow($invoice))->values()->all(),
            'excluded_invoices' => $excluded->values()->all(),
        ];
    }

    /**
     * Gera boletos no provedor e retorna PDF único concatenado.
     *
     * @param  array<int>|null  $invoiceIds
     * @return array{format: 'pdf'|'zip', filename: string, content: string, generated: array<int, array<string, mixed>>, errors: array<int, array<string, mixed>>}
     */
    public function generate(
        Enrollment $enrollment,
        string $environment,
        ?array $invoiceIds = null,
        ?string $provider = null,
        bool $issueMissing = false,
        bool $requireAll = true,
    ): array {
        $enrollment->loadMissing('student');
        $invoices = $this->eligibleInvoices($enrollment, $invoiceIds);

        if ($invoices->isEmpty()) {
            throw new RuntimeException('Não há cobranças em aberto para gerar o carnê.');
        }

        $pdfFiles = [];
        $generated = [];
        $errors = [];
        $sequence = 0;

        foreach ($invoices as $invoice) {
            try {
                $fresh = $issueMissing
                    ? $this->chargeService->ensureBoletoCharge($invoice, $environment, $provider)
                    : $this->chargeService->prepareBoletoForCarneBundle($invoice, $environment);

                $pdfUrl = $this->resolvePdfUrlWithRetry($fresh, $environment);

                $binary = $this->downloadPdf($pdfUrl, $fresh, $environment);
                $sequence++;
                $pdfFiles[] = [
                    'name' => $this->boletoFilename($fresh, $sequence),
                    'content' => $binary,
                ];
                $generated[] = [
                    'invoice_id' => $fresh->id,
                    'description' => $fresh->description,
                    'due_date' => $fresh->due_date?->toDateString(),
                    'amount' => (string) $fresh->amount,
                    'pdf_url' => $pdfUrl,
                    'source' => $issueMissing ? 'issued_or_existing' : 'existing_boleto_only',
                ];
            } catch (\Throwable $e) {
                Log::warning('EnrollmentCarneService invoice failed', [
                    'enrollment_id' => $enrollment->id,
                    'invoice_id' => $invoice->id,
                    'error' => $e->getMessage(),
                ]);
                $errors[] = [
                    'invoice_id' => $invoice->id,
                    'description' => $invoice->description,
                    'due_date' => $invoice->due_date?->toDateString(),
                    'message' => $this->humanizeCarneError($e),
                ];
            }
        }

        if ($pdfFiles === []) {
            $hint = $this->buildFailureHint($errors, $issueMissing);

            throw new CarneGenerationException(
                'Não foi possível montar o carnê.',
                $errors,
                $hint
            );
        }

        if ($requireAll && $errors !== []) {
            throw new CarneGenerationException(
                'O carnê exige todas as parcelas selecionadas. Corrija as pendências abaixo ou desmarque "Exigir todas as parcelas".',
                $errors,
                $issueMissing
                    ? null
                    : 'Parcelas sem boleto: gere em Financeiro ou ative "Emitir faltantes no provedor".'
            );
        }

        $bundled = $this->pdfMerge->bundle($pdfFiles);

        if ($bundled['format'] === 'zip' && strlen($bundled['content']) < 100) {
            throw new CarneGenerationException(
                'O arquivo ZIP do carnê ficou vazio.',
                $errors,
                null
            );
        }

        $studentSlug = preg_replace('/[^a-z0-9]+/i', '-', (string) ($enrollment->student?->name ?? 'aluno')) ?: 'aluno';
        $extension = $bundled['format'] === 'zip' ? 'zip' : 'pdf';
        $filename = sprintf(
            'carne-matricula-%s-%s.%s',
            $enrollment->enrollment_number ?? $enrollment->id,
            trim($studentSlug, '-'),
            $extension
        );

        return [
            'format' => $bundled['format'],
            'filename' => $filename,
            'content' => $bundled['content'],
            'generated' => $generated,
            'errors' => $errors,
        ];
    }

    public function resolveEnvironment(?string $requested, ?User $user): string
    {
        return $this->chargeService->resolveEnvironment($requested, $user);
    }

    /**
     * @return Collection<int, Invoice>
     */
    private function enrollmentInvoices(Enrollment $enrollment): Collection
    {
        return Invoice::query()
            ->where('enrollment_id', $enrollment->id)
            ->where('tenant_id', $enrollment->tenant_id)
            ->orderByRaw('due_date IS NULL')
            ->orderBy('due_date')
            ->orderBy('id')
            ->get();
    }

    /**
     * @param  array<int>|null  $invoiceIds
     * @return Collection<int, Invoice>
     */
    private function eligibleInvoices(Enrollment $enrollment, ?array $invoiceIds): Collection
    {
        return $this->enrollmentInvoices($enrollment)
            ->filter(function (Invoice $invoice) use ($invoiceIds) {
                if ($this->classifyIneligibility($invoice) !== null) {
                    return false;
                }

                if ($invoiceIds !== null && $invoiceIds !== [] && ! in_array($invoice->id, $invoiceIds, true)) {
                    return false;
                }

                return true;
            })
            ->values();
    }

    /**
     * @return array{reason_code: string, reason_label: string}|null
     */
    private function classifyIneligibility(Invoice $invoice): ?array
    {
        if ($invoice->status === 'paid') {
            return [
                'reason_code' => 'paid',
                'reason_label' => 'Cobrança já paga',
            ];
        }

        if ($invoice->status === 'cancelled') {
            return [
                'reason_code' => 'cancelled',
                'reason_label' => 'Cobrança cancelada',
            ];
        }

        if (! $invoice->due_date) {
            return [
                'reason_code' => 'no_due_date',
                'reason_label' => 'Sem data de vencimento',
            ];
        }

        if (! in_array($invoice->status, ['pending', 'overdue'], true)) {
            return [
                'reason_code' => 'invalid_status',
                'reason_label' => 'Status não permite inclusão no carnê (' . $invoice->status . ')',
            ];
        }

        $storedMethod = $this->chargeAssets->resolveChargeMethodFromInvoice($invoice);
        if ($storedMethod === 'pix' && $invoice->cora_charge_id) {
            return [
                'reason_code' => 'pix_only',
                'reason_label' => 'Já emitida em PIX — o carnê exige boleto ou boleto+PIX',
            ];
        }

        return null;
    }

    /**
     * @param  array{reason_code: string, reason_label: string}  $ineligibility
     * @return array<string, mixed>
     */
    private function excludedInvoiceRow(Invoice $invoice, array $ineligibility): array
    {
        $chargeMethod = $this->chargeAssets->resolveChargeMethodFromInvoice($invoice);

        return [
            'invoice_id' => $invoice->id,
            'description' => $invoice->description,
            'due_date' => $invoice->due_date?->toDateString(),
            'amount' => (string) $invoice->amount,
            'status' => $invoice->status,
            'payment_method' => $invoice->payment_method,
            'charge_method' => $chargeMethod,
            'cora_charge_id' => $invoice->cora_charge_id,
            'reason_code' => $ineligibility['reason_code'],
            'reason_label' => $ineligibility['reason_label'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function invoiceRow(Invoice $invoice): array
    {
        $assets = $this->chargeAssets->paymentAssetsFromInvoice($invoice);

        return [
            'invoice_id' => $invoice->id,
            'description' => $invoice->description,
            'due_date' => $invoice->due_date?->toDateString(),
            'amount' => (string) $invoice->amount,
            'status' => $invoice->status,
            'has_boleto' => $this->chargeAssets->hasBoletoAssets($assets),
            'carne_ready' => $this->chargeAssets->hasBoletoAssets($assets),
            'needs_boleto_issue' => ! $this->chargeAssets->hasBoletoAssets($assets),
            'cora_charge_id' => $invoice->cora_charge_id,
        ];
    }

    private function resolvePdfUrlWithRetry(Invoice $invoice, string $environment): string
    {
        $attempts = [0, 2];
        $lastError = 'PDF do boleto indisponível no provedor.';

        foreach ($attempts as $waitSeconds) {
            if ($waitSeconds > 0) {
                sleep($waitSeconds);
                $invoice = $invoice->fresh();
                $factory = app(PaymentGatewayFactory::class);
                $this->chargeAssets->hydrateFromProvider(
                    $invoice,
                    $factory,
                    $this->chargeAssets->paymentAssetsFromInvoice($invoice),
                    $environment
                );
                $invoice = $invoice->fresh();
            }

            $pdfUrl = $this->chargeAssets->resolveBoletoPdfUrl($invoice);
            if ($pdfUrl !== null) {
                return $pdfUrl;
            }

            $lastError = 'PDF do boleto ainda não disponível no provedor.';
        }

        throw new RuntimeException($lastError . ' Aguarde alguns segundos e tente de novo.');
    }

    /**
     * @param  array<int, array<string, mixed>>  $errors
     */
    private function buildFailureHint(array $errors, bool $issueMissing): ?string
    {
        if (collect($errors)->contains(
            fn (array $row) => str_contains(strtolower($row['message'] ?? ''), 'cip')
                || str_contains(strtolower($row['message'] ?? ''), 'rec-0030')
        )) {
            return 'No ambiente stage da Cora, boleto puro pode ser rejeitado. Use produção ou marque "Emitir faltantes" com Boleto+PIX.';
        }

        if (! $issueMissing && collect($errors)->contains(
            fn (array $row) => str_contains(strtolower($row['message'] ?? ''), 'ainda não tem boleto')
        )) {
            return 'O carnê padrão só monta boletos já emitidos. Marque "Emitir faltantes no provedor" ou gere cada parcela em Financeiro antes.';
        }

        return null;
    }

    private function boletoFilename(Invoice $invoice, int $sequence): string
    {
        $due = $invoice->due_date?->format('Y-m-d') ?? 'sem-vencimento';

        return sprintf('%02d-boleto-%s-fatura-%d.pdf', $sequence, $due, $invoice->id);
    }

    private function downloadPdf(string $url, ?Invoice $invoice, string $environment): string
    {
        $url = $this->chargeAssets->coerceScalarString($url) ?? '';
        if ($url === '') {
            throw new RuntimeException(
                'URL do PDF do boleto inválida. Sincronize a cobrança em Financeiro e tente novamente.'
            );
        }

        $response = Http::timeout(45)
            ->withHeaders(['Accept' => 'application/pdf,*/*'])
            ->get($url);

        if (! $response->successful()) {
            throw new RuntimeException('Falha ao baixar PDF do boleto (HTTP ' . $response->status() . ').');
        }

        $body = $response->body();
        if ($this->isValidPdfBinary($body)) {
            return $body;
        }

        if ($invoice && $invoice->cora_charge_id && $invoice->tenant) {
            $factory = app(PaymentGatewayFactory::class);
            $chargeAssets = app(InvoiceCoraChargeAssetsService::class);
            $chargeAssets->hydrateFromProvider(
                $invoice,
                $factory,
                $chargeAssets->paymentAssetsFromInvoice($invoice),
                $environment
            );
            $retryUrl = $chargeAssets->resolveBoletoPdfUrl($invoice->fresh());
            if ($retryUrl && $retryUrl !== $url) {
                return $this->downloadPdf($retryUrl, null, $environment);
            }
        }

        throw new RuntimeException(
            'O link do boleto não retornou PDF válido. Aguarde alguns segundos e tente novamente, ou gere a cobrança individual antes do carnê.'
        );
    }

    private function isValidPdfBinary(string $body): bool
    {
        return $body !== ''
            && str_starts_with($body, '%PDF')
            && strlen($body) >= 200;
    }

    private function humanizeCarneError(\Throwable $e): string
    {
        if (str_contains($e->getMessage(), 'Array to string conversion')) {
            return 'Dados do boleto no provedor estão em formato inválido. Sincronize a cobrança em Financeiro e tente novamente.';
        }

        return $e->getMessage();
    }
}
