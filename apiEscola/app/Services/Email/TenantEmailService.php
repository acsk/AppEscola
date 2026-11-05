<?php

namespace App\Services\Email;

use App\Models\EmailLog;
use App\Models\TenantEmailSetting;
use App\Models\User;
use App\Services\Saas\SaasAuditService;
use App\Support\BusinessDate;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Str;

/**
 * E-mail de cada tenant: configuração do provedor (chave criptografada), envio com registro em email_logs,
 * verificação de domínio e e-mail de teste. Uso: app(TenantEmailService::class)->send($tenantId, $message, 'categoria').
 */
class TenantEmailService
{
    public function __construct(
        private readonly EmailProviderRegistry $providers,
        private readonly SaasAuditService $audit,
    ) {
    }

    /** @return array<string, mixed> resumo seguro (a chave nunca volta) */
    public function summary(int $tenantId): array
    {
        $setting = TenantEmailSetting::query()->where('tenant_id', $tenantId)->first();
        $monthStart = BusinessDate::today()->startOfMonth();
        $month = EmailLog::query()->where('tenant_id', $tenantId)->where('created_at', '>=', $monthStart)
            ->selectRaw("sum(case when status = 'sent' then 1 else 0 end) as sent, sum(case when status = 'failed' then 1 else 0 end) as failed")->first();

        return [
            'providers' => array_map(fn ($key) => ['key' => $key, 'label' => $this->providers->get($key)->label()], $this->providers->keys()),
            'configured' => (bool) $setting,
            'provider' => $setting?->provider ?? 'resend',
            'key_hint' => $setting?->key_hint,
            'from_email' => $setting?->from_email,
            'from_name' => $setting?->from_name,
            'reply_to' => $setting?->reply_to,
            'active' => (bool) ($setting?->active ?? false),
            'domain_status' => $setting?->domain_status,
            'verified_at' => $setting?->verified_at?->toISOString(),
            'last_error' => $setting?->last_error,
            'configured_at' => $setting?->configured_at?->toISOString(),
            'month' => ['sent' => (int) ($month->sent ?? 0), 'failed' => (int) ($month->failed ?? 0)],
        ];
    }

    /** @param  array{provider: string, api_key?: string|null, from_email: string, from_name?: string|null, reply_to?: string|null, active?: bool}  $data */
    public function save(int $tenantId, array $data, User $actor): array
    {
        $setting = TenantEmailSetting::query()->firstOrNew(['tenant_id' => $tenantId]);
        $apiKey = trim((string) ($data['api_key'] ?? ''));
        $changedTarget = $apiKey !== '' || $setting->from_email !== $data['from_email'] || $setting->provider !== $data['provider'];

        $setting->fill([
            'provider' => $data['provider'],
            'from_email' => strtolower(trim($data['from_email'])),
            'from_name' => $data['from_name'] ?? null,
            'reply_to' => $data['reply_to'] ?? null,
            'active' => (bool) ($data['active'] ?? true),
        ]);
        if ($apiKey !== '') {
            $setting->api_key = $apiKey;
            $setting->key_hint = Str::substr($apiKey, -4);
            $setting->configured_at = now();
        }
        if ($changedTarget) {
            $setting->domain_status = null;
            $setting->verified_at = null;
            $setting->last_error = null;
        }
        $setting->save();
        $this->audit->log($actor, $tenantId, 'email.settings', 'Configuração de e-mail salva ('.$setting->provider.', remetente '.$setting->from_email.')'.($apiKey !== '' ? ', chave atualizada' : ''));

        return $this->summary($tenantId);
    }

    public function delete(int $tenantId, User $actor): bool
    {
        $deleted = (bool) TenantEmailSetting::query()->where('tenant_id', $tenantId)->delete();
        if ($deleted) {
            $this->audit->log($actor, $tenantId, 'email.settings_removed', 'Configuração de e-mail removida');
        }

        return $deleted;
    }

    public function verify(int $tenantId): EmailVerification
    {
        [$setting, $provider, $credentials] = $this->resolve($tenantId, false);
        $result = $provider->verify($credentials);
        $setting->update([
            'domain_status' => $result->keyValid ? $result->domainStatus : null,
            'verified_at' => $result->keyValid && $result->domainStatus === 'verified' ? now() : $setting->verified_at,
            'last_error' => $result->keyValid && in_array($result->domainStatus, ['verified', 'unknown'], true) ? null : Str::limit($result->message, 255, ''),
        ]);

        return $result;
    }

    /** Envia pelo provedor do tenant e registra o resultado. Lança EmailNotConfiguredException sem configuração ativa. */
    public function send(int $tenantId, EmailMessage $message, string $category, ?User $user = null): EmailSendResult
    {
        [$setting, $provider, $credentials] = $this->resolve($tenantId, true);
        $startedAt = microtime(true);
        $result = $provider->send(new EmailMessage(
            $message->to, $message->subject, $message->html, $message->text, $message->replyTo, $message->tags + ['category' => $category],
        ), $credentials);

        EmailLog::query()->create([
            'tenant_id' => $tenantId,
            'user_id' => $user?->id,
            'provider' => $provider->key(),
            'category' => Str::limit($category, 40, ''),
            'to' => Str::limit(implode(', ', $message->to), 500, ''),
            'subject' => Str::limit($message->subject, 255, ''),
            'status' => $result->sent ? 'sent' : 'failed',
            'provider_message_id' => $result->messageId,
            'error_code' => $result->errorCode,
            'error' => $result->error ? Str::limit($result->error, 255, '') : null,
            'duration_ms' => (int) round((microtime(true) - $startedAt) * 1000),
        ]);
        $setting->update(['last_error' => $result->sent ? null : Str::limit((string) $result->error, 255, '')]);

        return $result;
    }

    public function sendTest(int $tenantId, string $to, User $user): EmailSendResult
    {
        $setting = TenantEmailSetting::query()->where('tenant_id', $tenantId)->first();
        $from = $setting?->from_name ?: 'a instituição';

        return $this->send($tenantId, new EmailMessage(
            to: [$to],
            subject: 'Teste de envio de e-mail',
            html: '<p>Este é um e-mail de teste enviado pelo painel de '.e($from).'.</p><p>Se você recebeu, a configuração de envio está funcionando.</p>',
            text: "Este é um e-mail de teste enviado pelo painel de {$from}.\nSe você recebeu, a configuração de envio está funcionando.",
        ), 'test', $user);
    }

    public function logs(int $tenantId, int $page = 1): LengthAwarePaginator
    {
        return EmailLog::query()->with('user:id,name')->where('tenant_id', $tenantId)->latest('id')->paginate(20, ['*'], 'page', $page);
    }

    /** @return array{0: TenantEmailSetting, 1: \App\Services\Email\Contracts\EmailProvider, 2: EmailCredentials} */
    private function resolve(int $tenantId, bool $requireActive): array
    {
        $setting = TenantEmailSetting::query()->where('tenant_id', $tenantId)->first();
        if (! $setting || ($requireActive && ! $setting->active)) {
            throw new EmailNotConfiguredException();
        }

        return [$setting, $this->providers->get($setting->provider), new EmailCredentials($setting->api_key, $setting->from_email, $setting->from_name, $setting->reply_to)];
    }
}
