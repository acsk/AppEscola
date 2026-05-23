<?php

namespace App\Services;

use App\Models\Invoice;
use App\Services\PaymentGatewayFactory;

/**
 * Normaliza método e assets de cobrança Cora (boleto, PIX, híbrido).
 */
class InvoiceCoraChargeAssetsService
{
    /**
     * @param  array<string, mixed>  $externalInvoice
     * @return array<string, mixed>
     */
    public function paymentAssetsFromExternal(array $externalInvoice): array
    {
        return [
            'boleto_number' => $this->extractBoletoNumber($externalInvoice),
            'boleto_digitable' => $this->extractBoletoDigitable($externalInvoice),
            'boleto_url' => $this->extractPaymentUrl($externalInvoice),
            'pix_copy_paste' => $this->extractPixCopyPaste($externalInvoice),
            'pix_qr_image_url' => $this->extractPixQrImageUrl($externalInvoice),
        ];
    }

    /**
     * @param  array<string, mixed>  $assets
     */
    public function shouldHydrateFromProvider(Invoice $invoice, array $assets): bool
    {
        if (! $invoice->cora_charge_id || ! $invoice->tenant_id) {
            return false;
        }

        $hasBoleto = $this->hasBoletoAssets($assets);
        $hasPix = $this->hasPixAssets($assets);
        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];

        if ($hasBoleto && $this->resolveBoletoPdfUrl($invoice) === null) {
            return true;
        }

        if ($hasBoleto && $hasPix) {
            return false;
        }

        if ($hasBoleto && $this->indicatesHybridCharge($payload)) {
            return ! $hasPix;
        }

        return ! $hasBoleto || ! $hasPix;
    }

    /**
     * Busca detalhes na Cora e persiste assets ausentes (ex.: EMV PIX em boleto híbrido).
     *
     * @param  array<string, mixed>  $assets
     * @return array<string, mixed>
     */
    public function hydrateFromProvider(Invoice $invoice, PaymentGatewayFactory $factory, array $assets, string $environment = 'prod'): array
    {
        if (! $invoice->cora_charge_id) {
            return $assets;
        }

        $invoice->loadMissing('tenant');
        if (! $invoice->tenant) {
            return $assets;
        }

        try {
            $external = $factory->resolve('cora')->getInvoiceById(
                $invoice->tenant,
                (string) $invoice->cora_charge_id,
                $environment
            );
        } catch (\Throwable) {
            return $assets;
        }

        if ($external === []) {
            return $assets;
        }

        $fromExternal = $this->paymentAssetsFromExternal($external);
        $mergedAssets = array_merge($assets, array_filter([
            'boleto_number' => $fromExternal['boleto_number'] ?? null,
            'boleto_digitable' => $fromExternal['boleto_digitable'] ?? null,
            'boleto_url' => $fromExternal['boleto_url'] ?? null,
            'pix_copy_paste' => $fromExternal['pix_copy_paste'] ?? null,
            'pix_qr_image_url' => $fromExternal['pix_qr_image_url'] ?? null,
        ], fn ($value) => $this->coerceScalarString($value) !== null));

        $existingPayload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
        try {
            $storedMethod = $this->resolveChargeMethodFromExternal(array_replace_recursive($existingPayload, $external));
        } catch (\Throwable) {
            $storedMethod = $this->resolveChargeMethodFromInvoice($invoice) ?? 'bank_slip';
        }

        $invoice->update([
            'cora_payload' => array_replace_recursive($existingPayload, $external),
            'cora_payment_url' => $this->coerceScalarString($mergedAssets['boleto_url'] ?? null)
                ?? $this->coerceScalarString($invoice->cora_payment_url),
            'cora_pix_copy_paste' => $this->coerceScalarString($mergedAssets['pix_copy_paste'] ?? null)
                ?? $this->coerceScalarString($invoice->cora_pix_copy_paste),
            'boleto_number' => $this->coerceScalarString($mergedAssets['boleto_number'] ?? null)
                ?? $this->coerceScalarString($invoice->boleto_number),
            'boleto_digitable' => $this->coerceScalarString($mergedAssets['boleto_digitable'] ?? null)
                ?? $this->coerceScalarString($invoice->boleto_digitable),
            'payment_method' => match ($storedMethod) {
                'hybrid' => 'hybrid',
                'pix' => 'pix',
                default => $invoice->payment_method ?: 'bank_slip',
            },
            'cora_last_synced_at' => now(),
        ]);

        return $this->paymentAssetsFromInvoice($invoice->fresh());
    }

    public function paymentAssetsFromInvoice(Invoice $invoice): array
    {
        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
        $fromPayload = $this->paymentAssetsFromExternal($payload);

        return [
            'charge_id' => $invoice->cora_charge_id,
            'charge_status' => $invoice->cora_status,
            'boleto_number' => $this->coerceScalarString($invoice->boleto_number)
                ?: $fromPayload['boleto_number'],
            'boleto_digitable' => $this->coerceScalarString($invoice->boleto_digitable)
                ?: $fromPayload['boleto_digitable'],
            'boleto_url' => $this->coerceScalarString($invoice->cora_payment_url)
                ?: $fromPayload['boleto_url'],
            'pix_copy_paste' => $this->coerceScalarString($invoice->cora_pix_copy_paste)
                ?: $fromPayload['pix_copy_paste'],
            'pix_qr_image_url' => $fromPayload['pix_qr_image_url'],
            'last_synced_at' => $invoice->cora_last_synced_at?->toISOString(),
        ];
    }

    public function hasBoletoAssets(array $assets): bool
    {
        return $this->coerceScalarString($assets['boleto_digitable'] ?? null) !== null
            || $this->coerceScalarString($assets['boleto_number'] ?? null) !== null
            || $this->coerceScalarString($assets['boleto_url'] ?? null) !== null;
    }

    /**
     * Normaliza tokens de método de pagamento (string escalar; ignora arrays/objetos Cora).
     */
    private function normalizePaymentMethodToken(mixed $value): ?string
    {
        if (is_array($value)) {
            return null;
        }

        $scalar = $this->coerceScalarString($value);
        if ($scalar === null) {
            return null;
        }

        return strtoupper(trim($scalar));
    }

    /**
     * Normaliza valores da Cora (string, número ou array com url/href) para string escalar.
     */
    public function coerceScalarString(mixed $value): ?string
    {
        if (is_string($value)) {
            $trimmed = trim($value);

            return $trimmed !== '' ? $trimmed : null;
        }

        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        if (! is_array($value)) {
            return null;
        }

        foreach (['url', 'href', 'pdf', 'link', 'download', 'file', '0'] as $key) {
            if (! array_key_exists($key, $value)) {
                continue;
            }

            $nested = $this->coerceScalarString($value[$key]);
            if ($nested !== null) {
                return $nested;
            }
        }

        foreach ($value as $nestedValue) {
            $nested = $this->coerceScalarString($nestedValue);
            if ($nested !== null) {
                return $nested;
            }
        }

        return null;
    }

    /**
     * URL preferencial do PDF do boleto (para carnê / download em lote).
     */
    public function resolveBoletoPdfUrl(Invoice $invoice): ?string
    {
        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];

        return $this->resolveBoletoPdfUrlFromPayload($payload, $invoice);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function resolveBoletoPdfUrlFromPayload(array $payload, ?Invoice $invoice = null): ?string
    {
        foreach ($this->collectBoletoPdfCandidates($payload, $invoice) as $candidate) {
            $url = $this->coerceScalarString($candidate);
            if ($url === null) {
                continue;
            }

            if ($this->looksLikePdfUrl($url)) {
                return $url;
            }
        }

        foreach ($this->collectBoletoPdfCandidates($payload, $invoice) as $candidate) {
            $url = $this->coerceScalarString($candidate);
            if ($url !== null && $this->looksLikeHttpUrl($url)) {
                return $url;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<int, mixed>
     */
    public function collectBoletoPdfCandidates(array $payload, ?Invoice $invoice = null): array
    {
        $bankSlip = data_get($payload, 'payment_options.bank_slip');

        $candidates = [
            data_get($payload, 'payment_options.bank_slip.url'),
            data_get($payload, 'payment_options.bank_slip.pdf'),
            data_get($payload, 'payment_options.bank_slip.link'),
            is_array($bankSlip) ? $bankSlip : null,
            data_get($payload, 'bank_slip.url'),
            data_get($payload, 'bank_slip.pdf'),
            data_get($payload, 'boleto_url'),
            data_get($payload, 'payment_url'),
            data_get($payload, 'checkout_url'),
            data_get($payload, 'method_charges.bank_slip.payment_url'),
            data_get($payload, 'links.payment'),
            data_get($payload, 'links.checkout'),
            data_get($payload, 'links.bank_slip'),
        ];

        $links = $payload['links'] ?? null;
        if (is_array($links)) {
            $candidates[] = $this->extractHrefFromLinks($links, ['payment', 'checkout', 'bank_slip', 'BANK_SLIP']);
        }

        if ($invoice !== null) {
            $candidates[] = $invoice->cora_payment_url;
        }

        return $candidates;
    }

    /**
     * @param  array<int|string, mixed>  $links
     * @param  array<int, string>  $rels
     */
    public function extractHrefFromLinks(array $links, array $rels): ?string
    {
        foreach ($rels as $rel) {
            $key = strtolower($rel);
            if (array_key_exists($key, $links)) {
                $href = $this->coerceScalarString($links[$key]);
                if ($href !== null) {
                    return $href;
                }
            }
        }

        if (! array_is_list($links)) {
            return null;
        }

        foreach ($links as $link) {
            if (! is_array($link)) {
                $href = $this->coerceScalarString($link);
                if ($href !== null) {
                    return $href;
                }

                continue;
            }

            $rel = strtoupper((string) ($link['rel'] ?? $link['type'] ?? $link['name'] ?? ''));
            $href = $this->coerceScalarString($link['href'] ?? $link['url'] ?? null);

            if ($href === null) {
                continue;
            }

            foreach ($rels as $wanted) {
                $wantedUpper = strtoupper($wanted);
                if ($rel === $wantedUpper || str_contains($rel, $wantedUpper)) {
                    return $href;
                }
            }
        }

        foreach ($links as $link) {
            $href = $this->coerceScalarString(is_array($link) ? ($link['href'] ?? $link['url'] ?? null) : $link);
            if ($href !== null) {
                return $href;
            }
        }

        return null;
    }

    private function looksLikeHttpUrl(string $url): bool
    {
        return str_starts_with(strtolower($url), 'http://')
            || str_starts_with(strtolower($url), 'https://');
    }

    private function looksLikePdfUrl(string $url): bool
    {
        $path = strtolower((string) parse_url($url, PHP_URL_PATH));

        return str_ends_with($path, '.pdf')
            || str_contains(strtolower($url), '.pdf')
            || str_contains(strtolower($url), 'boleto-qrcode')
            || str_contains(strtolower($url), '/bank_slip');
    }

    public function hasPixAssets(array $assets): bool
    {
        return $this->coerceScalarString($assets['pix_copy_paste'] ?? null) !== null
            || $this->coerceScalarString($assets['pix_qr_image_url'] ?? null) !== null;
    }

    /**
     * @param  array<string, mixed>  $externalInvoice
     */
    public function resolveChargeMethodFromExternal(array $externalInvoice): string
    {
        $hasBoleto = $this->isBoletoInvoice($externalInvoice)
            || $this->extractBoletoDigitable($externalInvoice) !== null
            || $this->extractBoletoNumber($externalInvoice) !== null;
        $hasPix = $this->extractPixCopyPaste($externalInvoice) !== null
            || $this->extractPixQrImageUrl($externalInvoice) !== null;
        $hybridIndicator = $this->indicatesHybridCharge($externalInvoice);

        if ($hasBoleto && ($hasPix || $hybridIndicator)) {
            return 'hybrid';
        }

        if ($hasPix && ! $hasBoleto) {
            return 'pix';
        }

        if ($hasBoleto) {
            return 'bank_slip';
        }

        $methodCandidates = [
            $externalInvoice['payment_form'] ?? null,
            $externalInvoice['payment_method'] ?? null,
            data_get($externalInvoice, 'payment.form'),
            data_get($externalInvoice, 'payment.method'),
            data_get($externalInvoice, 'payment_options.selected'),
        ];

        foreach ($methodCandidates as $method) {
            $normalized = $this->normalizePaymentMethodToken($method);
            if ($normalized === null) {
                continue;
            }
            if (in_array($normalized, ['PIX', 'INSTANT_PAYMENT'], true)) {
                return 'pix';
            }
            if (in_array($normalized, ['BANK_SLIP', 'BOLETO', 'BILLET', 'BANKSLIP'], true)) {
                return 'bank_slip';
            }
            if ($normalized === 'HYBRID' || str_contains($normalized, 'HYBRID')) {
                return 'hybrid';
            }
        }

        return 'bank_slip';
    }

    public function resolveChargeMethodFromInvoice(Invoice $invoice): ?string
    {
        if (! $invoice->cora_charge_id) {
            return null;
        }

        $assets = $this->paymentAssetsFromInvoice($invoice);
        $hasBoleto = $this->hasBoletoAssets($assets);
        $hasPix = $this->hasPixAssets($assets);
        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
        $hybridIndicator = $this->indicatesHybridCharge($payload)
            || $this->isHybridBoletoUrl($this->coerceScalarString($assets['boleto_url'] ?? null));

        if ($hasBoleto && ($hasPix || $hybridIndicator)) {
            return 'hybrid';
        }

        if ($hasPix) {
            return 'pix';
        }

        if ($hasBoleto) {
            return 'bank_slip';
        }

        $paymentMethod = strtolower((string) $invoice->payment_method);

        return match (true) {
            $paymentMethod === 'hybrid' => 'hybrid',
            in_array($paymentMethod, ['boleto', 'bank_slip'], true) => 'bank_slip',
            $paymentMethod === 'pix' => 'pix',
            default => null,
        };
    }

    /**
     * Método para API/UI: pix | boleto | hybrid
     */
    public function resolveUiMethodFromInvoice(Invoice $invoice): ?string
    {
        $stored = $this->resolveChargeMethodFromInvoice($invoice);

        return match ($stored) {
            'bank_slip' => 'boleto',
            'hybrid' => 'hybrid',
            'pix' => 'pix',
            default => null,
        };
    }

    /**
     * Boleto Cora com QR PIX no PDF (URL ou metadados do provedor).
     *
     * @param  array<string, mixed>  $externalInvoice
     */
    public function indicatesHybridCharge(array $externalInvoice): bool
    {
        $methodCandidates = [
            $externalInvoice['payment_form'] ?? null,
            $externalInvoice['payment_method'] ?? null,
            data_get($externalInvoice, 'payment.form'),
            data_get($externalInvoice, 'payment.method'),
            data_get($externalInvoice, 'payment_options.selected'),
            data_get($externalInvoice, 'payment_options.type'),
        ];

        foreach ($methodCandidates as $method) {
            $normalized = $this->normalizePaymentMethodToken($method);
            if ($normalized === null) {
                continue;
            }
            if ($normalized === 'HYBRID' || str_contains($normalized, 'HYBRID')) {
                return true;
            }
        }

        $boletoUrl = $this->extractPaymentUrl($externalInvoice);

        if ($this->isHybridBoletoUrl($boletoUrl)) {
            return true;
        }

        return data_get($externalInvoice, 'payment_options.bank_slip') !== null
            && (data_get($externalInvoice, 'payment_options.pix') !== null
                || data_get($externalInvoice, 'pix') !== null);
    }

    public function isHybridBoletoUrl(?string $url): bool
    {
        if ($url === null || trim($url) === '') {
            return false;
        }

        $normalized = strtolower(trim($url));

        return str_contains($normalized, 'boleto-qrcode')
            || str_contains($normalized, 'qrcode')
            || str_contains($normalized, 'qr-code');
    }

    /**
     * @param  array<string, mixed>  $externalInvoice
     */
    public function isBoletoInvoice(array $externalInvoice): bool
    {
        $methodCandidates = [
            $externalInvoice['payment_method'] ?? null,
            $externalInvoice['payment_type'] ?? null,
            data_get($externalInvoice, 'payment_options.type'),
            data_get($externalInvoice, 'payment_options.selected'),
            data_get($externalInvoice, 'payment_form'),
        ];

        foreach ($methodCandidates as $method) {
            $normalized = $this->normalizePaymentMethodToken($method);
            if ($normalized === null) {
                continue;
            }
            if (in_array($normalized, ['BANK_SLIP', 'BOLETO', 'BILLET', 'BANKSLIP'], true)) {
                return true;
            }
        }

        if (is_array(data_get($externalInvoice, 'payment_options.bank_slip'))
            && data_get($externalInvoice, 'payment_options.bank_slip') !== []) {
            return true;
        }

        return $this->extractBoletoNumber($externalInvoice) !== null
            || $this->extractBoletoDigitable($externalInvoice) !== null
            || data_get($externalInvoice, 'payment_options.bank_slip') !== null
            || data_get($externalInvoice, 'bank_slip') !== null
            || data_get($externalInvoice, 'boleto') !== null
            || data_get($externalInvoice, 'bank_slip_url') !== null
            || data_get($externalInvoice, 'boleto_url') !== null;
    }

    /**
     * @param  array<string, mixed>  $externalInvoice
     */
    private function extractPaymentUrl(array $externalInvoice): ?string
    {
        $links = $externalInvoice['links'] ?? null;
        $candidates = [
            data_get($externalInvoice, 'payment_options.bank_slip.url'),
            data_get($externalInvoice, 'payment_options.bank_slip.pdf'),
            $externalInvoice['payment_url'] ?? null,
            $externalInvoice['checkout_url'] ?? null,
            data_get($externalInvoice, 'links.payment'),
            data_get($externalInvoice, 'link'),
            is_array($links) ? $this->extractHrefFromLinks($links, ['payment', 'checkout', 'bank_slip']) : null,
        ];

        foreach ($candidates as $value) {
            $normalized = $this->coerceScalarString($value);
            if ($normalized !== null) {
                return $normalized;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $externalInvoice
     */
    private function extractPixCopyPaste(array $externalInvoice): ?string
    {
        $candidates = [
            data_get($externalInvoice, 'pix.copy_paste'),
            data_get($externalInvoice, 'pix.emv'),
            data_get($externalInvoice, 'payment_options.pix.emv'),
            data_get($externalInvoice, 'payment_options.pix.copy_paste'),
            $externalInvoice['pix_copy_paste'] ?? null,
            $externalInvoice['emv'] ?? null,
        ];

        foreach ($candidates as $value) {
            $normalized = $this->coerceScalarString($value);
            if ($normalized !== null) {
                return $normalized;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $externalInvoice
     */
    private function extractPixQrImageUrl(array $externalInvoice): ?string
    {
        $candidates = [
            data_get($externalInvoice, 'pix.qr_code_image_url'),
            data_get($externalInvoice, 'pix.qr_code_url'),
            data_get($externalInvoice, 'payment_options.pix.url'),
            data_get($externalInvoice, 'payment_options.pix.qr_code_url'),
            $externalInvoice['qr_code_image_url'] ?? null,
            $externalInvoice['qr_code_url'] ?? null,
        ];

        foreach ($candidates as $value) {
            $normalized = $this->coerceScalarString($value);
            if ($normalized !== null) {
                return $normalized;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $externalInvoice
     */
    private function extractBoletoNumber(array $externalInvoice): ?string
    {
        $candidates = [
            data_get($externalInvoice, 'payment_options.bank_slip.barcode'),
            data_get($externalInvoice, 'payment_options.bank_slip.number'),
            data_get($externalInvoice, 'bank_slip.barcode'),
            data_get($externalInvoice, 'boleto.barcode'),
            $externalInvoice['barcode'] ?? null,
        ];

        foreach ($candidates as $value) {
            $normalized = $this->coerceScalarString($value);
            if ($normalized !== null) {
                return $normalized;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $externalInvoice
     */
    private function extractBoletoDigitable(array $externalInvoice): ?string
    {
        $candidates = [
            data_get($externalInvoice, 'payment_options.bank_slip.digitable'),
            data_get($externalInvoice, 'payment_options.bank_slip.our_number'),
            data_get($externalInvoice, 'bank_slip.digitable'),
            data_get($externalInvoice, 'boleto.digitable'),
            $externalInvoice['digitable'] ?? null,
        ];

        foreach ($candidates as $value) {
            $normalized = $this->coerceScalarString($value);
            if ($normalized !== null) {
                return $normalized;
            }
        }

        return null;
    }
}
