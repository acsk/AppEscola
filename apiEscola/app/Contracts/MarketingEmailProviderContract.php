<?php

namespace App\Contracts;

interface MarketingEmailProviderContract
{
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
        array $metadata = []
    ): array;
}
