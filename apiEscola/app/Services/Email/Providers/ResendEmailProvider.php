<?php

namespace App\Services\Email\Providers;

use App\Services\Email\Contracts\EmailProvider;
use App\Services\Email\EmailCredentials;
use App\Services\Email\EmailMessage;
use App\Services\Email\EmailSendResult;
use App\Services\Email\EmailVerification;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/** Resend (resend.com): POST /emails para enviar e GET /domains para conferir a chave e o domínio. */
class ResendEmailProvider implements EmailProvider
{
    public function key(): string
    {
        return 'resend';
    }

    public function label(): string
    {
        return 'Resend';
    }

    public function send(EmailMessage $message, EmailCredentials $credentials): EmailSendResult
    {
        $payload = array_filter([
            'from' => $credentials->from(),
            'to' => array_values($message->to),
            'subject' => $message->subject,
            'html' => $message->html,
            'text' => $message->text,
            'reply_to' => $message->replyTo ?? $credentials->replyTo,
            // Resend aceita só letras, números, _ e - em nome e valor dos tags.
            'tags' => array_values(array_map(
                fn ($name, $value) => ['name' => $this->tag((string) $name), 'value' => $this->tag((string) $value)],
                array_keys($message->tags),
                $message->tags,
            )) ?: null,
        ], fn ($v) => $v !== null && $v !== '');

        try {
            $response = $this->client($credentials)
                ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
                ->post('/emails', $payload);
        } catch (ConnectionException) {
            return EmailSendResult::failed('connection', 'Não foi possível conectar ao Resend.');
        }

        if ($response->successful() && $response->json('id')) {
            return EmailSendResult::sent((string) $response->json('id'));
        }

        return EmailSendResult::failed($this->errorCode($response), $this->errorMessage($response));
    }

    public function verify(EmailCredentials $credentials): EmailVerification
    {
        try {
            $response = $this->client($credentials)->get('/domains');
        } catch (ConnectionException) {
            return new EmailVerification(false, null, 'Não foi possível conectar ao Resend.');
        }

        // Chave "somente envio" não lista domínios, mas é válida: o teste de envio confirma o domínio.
        if ($response->status() === 401 && $this->errorCode($response) === 'restricted_api_key') {
            return new EmailVerification(true, 'unknown', 'Chave válida (somente envio). Envie um e-mail de teste para confirmar o domínio do remetente.');
        }
        if (! $response->successful()) {
            return new EmailVerification(false, null, $this->errorMessage($response));
        }

        $domain = collect($response->json('data', []))->first(fn ($d) => strtolower((string) ($d['name'] ?? '')) === $credentials->domain());
        if (! $domain) {
            return new EmailVerification(true, 'not_found', "O domínio {$credentials->domain()} não está cadastrado nesta conta do Resend.");
        }
        $status = (string) ($domain['status'] ?? '');

        return $status === 'verified'
            ? new EmailVerification(true, 'verified', "Domínio {$credentials->domain()} verificado: pronto para enviar.")
            : new EmailVerification(true, 'pending', "O domínio {$credentials->domain()} ainda não foi verificado no Resend (situação: {$status}). Confira os registros DNS.");
    }

    private function client(EmailCredentials $credentials): PendingRequest
    {
        return Http::baseUrl(rtrim((string) config('email_providers.resend.base_url'), '/'))
            ->withToken($credentials->apiKey)
            ->acceptJson()
            ->timeout((int) config('email_providers.resend.timeout', 15));
    }

    private function errorCode(Response $response): string
    {
        return Str::limit((string) ($response->json('name') ?: 'http_'.$response->status()), 40, '');
    }

    /** Mensagem amigável; o corpo de erro do provedor não vai para o log. */
    private function errorMessage(Response $response): string
    {
        return match (true) {
            in_array($response->status(), [401, 403], true) => 'A chave do Resend foi recusada. Confira a chave cadastrada.',
            $response->status() === 429 => 'Limite de envio do Resend atingido. Tente novamente em instantes.',
            $response->status() === 422 => 'O Resend recusou a mensagem: '.Str::limit((string) $response->json('message', 'dados inválidos'), 180),
            default => 'O Resend não aceitou o envio (HTTP '.$response->status().').',
        };
    }

    private function tag(string $value): string
    {
        return Str::limit(preg_replace('/[^A-Za-z0-9_-]/', '_', $value) ?: 'x', 256, '');
    }
}
