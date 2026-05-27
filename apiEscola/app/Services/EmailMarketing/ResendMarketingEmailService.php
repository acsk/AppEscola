<?php

namespace App\Services\EmailMarketing;

use App\Contracts\MarketingEmailProviderContract;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class ResendMarketingEmailService implements MarketingEmailProviderContract
{
    /**
     * @return array<string, mixed>
     */
    public function send(
        string $fromEmail,
        string $fromName,
        array $to,
        string $subject,
        ?string $html = null,
        ?string $text = null,
        array $cc = [],
        array $bcc = [],
        array $headers = [],
        array $metadata = []
    ): array {
        $apiKey = (string) config('services.resend_marketing.key');
        $baseUrl = rtrim((string) config('services.resend_marketing.base_url', 'https://api.resend.com'), '/');
        $timeout = (int) config('services.resend_marketing.timeout', 15);

        if ($apiKey === '') {
            throw new RuntimeException('RESEND_MARKETING_API_KEY não configurada.');
        }

        if ($html === null && $text === null) {
            throw new RuntimeException('Informe o conteúdo do e-mail em html ou text.');
        }

        if (empty($to)) {
            throw new RuntimeException('É necessário informar ao menos um destinatário.');
        }

        $payload = array_filter([
            'from' => trim($fromName) !== '' ? "{$fromName} <{$fromEmail}>" : $fromEmail,
            'to' => array_values($to),
            'cc' => !empty($cc) ? array_values($cc) : null,
            'bcc' => !empty($bcc) ? array_values($bcc) : null,
            'subject' => $subject,
            'html' => $html,
            'text' => $text,
            'headers' => !empty($headers) ? $headers : null,
            'tags' => $this->normalizeMetadataAsTags($metadata),
        ], static fn ($value) => $value !== null);

        $response = Http::timeout($timeout)
            ->withToken($apiKey)
            ->acceptJson()
            ->asJson()
            ->post("{$baseUrl}/emails", $payload);

        if ($response->failed()) {
            throw new RuntimeException(
                'Falha ao enviar e-mail via Resend: ' . $response->body()
            );
        }

        /** @var array<string, mixed> $json */
        $json = $response->json() ?? [];

        return $json;
    }

    /**
     * @param array<string, mixed> $metadata
     * @return array<int, array{name: string, value: string}>|null
     */
    private function normalizeMetadataAsTags(array $metadata): ?array
    {
        if ($metadata === []) {
            return null;
        }

        $tags = [];
        foreach ($metadata as $name => $value) {
            $serializedValue = is_scalar($value)
                ? (string) $value
                : (string) json_encode($value);

            $tags[] = [
                'name' => (string) $name,
                'value' => $serializedValue,
            ];
        }

        return $tags;
    }
}
