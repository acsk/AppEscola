<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailLog;
use App\Services\Email\EmailNotConfiguredException;
use App\Services\Email\EmailProviderRegistry;
use App\Services\Email\TenantEmailService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Configurações → E-mail: provedor de envio do tenant (Resend). Admin gerencia o próprio tenant;
 * super admin informa tenant_id. A chave nunca é devolvida — só key_hint.
 */
class TenantEmailSettingsController extends Controller
{
    use ScopedByTenant;

    public function __construct(private readonly TenantEmailService $email)
    {
    }

    public function show(Request $request): JsonResponse
    {
        return $this->success($this->email->summary($this->authorizeManage($request)), 'Configuração de e-mail carregada.');
    }

    public function update(Request $request, EmailProviderRegistry $providers): JsonResponse
    {
        $tenantId = $this->authorizeManage($request);
        $data = $request->validate([
            'provider' => ['required', Rule::in($providers->keys())],
            'api_key' => ['nullable', 'string', 'min:10', 'max:255'],
            'from_email' => ['required', 'email', 'max:255'],
            'from_name' => ['nullable', 'string', 'max:120'],
            'reply_to' => ['nullable', 'email', 'max:255'],
            'active' => ['sometimes', 'boolean'],
        ], [], ['api_key' => 'chave de API', 'from_email' => 'e-mail do remetente', 'from_name' => 'nome do remetente', 'reply_to' => 'responder para']);

        if (trim((string) ($data['api_key'] ?? '')) === '' && ! $this->email->summary($tenantId)['configured']) {
            return $this->validationError(['api_key' => ['Informe a chave de API.']], 'Informe a chave de API.');
        }

        return $this->success($this->email->save($tenantId, $data, $request->user()), 'Configuração de e-mail salva. Verifique o domínio e envie um teste.');
    }

    public function destroy(Request $request): JsonResponse
    {
        if (! $this->email->delete($this->authorizeManage($request), $request->user())) {
            return $this->notFound('Configuração de e-mail não encontrada.');
        }

        return $this->deleted('Configuração de e-mail removida.');
    }

    public function verify(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeManage($request);
        try {
            $result = $this->email->verify($tenantId);
        } catch (EmailNotConfiguredException $e) {
            return $this->validationError(['api_key' => [$e->getMessage()]], $e->getMessage());
        }
        $body = ['key_valid' => $result->keyValid, 'domain_status' => $result->domainStatus] + $this->email->summary($tenantId);

        return $result->keyValid && $result->domainStatus !== 'not_found' && $result->domainStatus !== 'pending'
            ? $this->success($body, $result->message)
            : $this->error($result->message, $body, 422);
    }

    public function test(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeManage($request);
        $data = $request->validate(['to' => ['required', 'email', 'max:255']], [], ['to' => 'destinatário']);
        try {
            $result = $this->email->sendTest($tenantId, $data['to'], $request->user());
        } catch (EmailNotConfiguredException $e) {
            return $this->validationError(['to' => [$e->getMessage()]], $e->getMessage());
        }

        return $result->sent
            ? $this->success(['message_id' => $result->messageId], "E-mail de teste enviado para {$data['to']}.")
            : $this->error($result->error ?? 'Falha no envio.', ['code' => $result->errorCode], 422);
    }

    public function logs(Request $request): JsonResponse
    {
        $page = $this->email->logs($this->authorizeManage($request), max(1, (int) $request->query('page', 1)));

        return $this->success([
            'items' => collect($page->items())->map(fn (EmailLog $log) => [
                'id' => $log->id,
                'category' => $log->category,
                'to' => $log->to,
                'subject' => $log->subject,
                'status' => $log->status,
                'provider' => $log->provider,
                'provider_message_id' => $log->provider_message_id,
                'error' => $log->error,
                'user' => $log->user?->name,
                'created_at' => $log->created_at?->toISOString(),
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ], 'Histórico de envios carregado.');
    }

    private function authorizeManage(Request $request): int
    {
        $user = $request->user();
        if (! $user || ! in_array($user->role, ['super_admin', 'admin'], true)) {
            throw new AccessDeniedHttpException('Acesso permitido apenas para admin ou super admin.');
        }

        return $this->requireTenantId($request);
    }
}
