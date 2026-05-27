<?php

namespace App\Services\EmailMarketing;

use App\Contracts\MarketingEmailProviderContract;
use InvalidArgumentException;

class EmailMarketingService
{
    /**
     * @param array<string, MarketingEmailProviderContract> $providers
     */
    public function __construct(
        private readonly array $providers
    ) {}

    /**
     * @param array<int, string> $to
     * @param array<int, string> $cc
     * @param array<int, string> $bcc
     * @param array<string, mixed> $headers
     * @param array<string, mixed> $metadata
     *
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
        array $metadata = [],
        ?string $provider = null
    ): array {
        $providerService = $this->resolveProvider($provider);

        return $providerService->send(
            fromEmail: $fromEmail,
            fromName: $fromName,
            to: $to,
            subject: $subject,
            html: $html,
            text: $text,
            cc: $cc,
            bcc: $bcc,
            headers: $headers,
            metadata: $metadata
        );
    }

    public function resolveProvider(?string $provider = null): MarketingEmailProviderContract
    {
        $providerKey = $provider ?: (string) config('services.marketing_email.provider', 'resend');

        if (!isset($this->providers[$providerKey])) {
            throw new InvalidArgumentException("Provedor de e-mail não suportado: {$providerKey}");
        }

        return $this->providers[$providerKey];
    }
}
