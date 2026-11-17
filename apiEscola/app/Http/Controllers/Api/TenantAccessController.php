<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use App\Services\SupportAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Acesso de suporte do super admin a um tenant: motivo, o que será feito e duração.
 * Emite um token próprio, preso ao tenant, sem mexer no token da sessão do super admin.
 */
class TenantAccessController extends Controller
{
    public function __construct(private readonly SupportAccessService $supportAccess)
    {
    }

    public function reasons(Request $request): JsonResponse
    {
        if (! $request->user()?->isSuperAdmin()) {
            return $this->forbidden('Acesso permitido apenas para super admin.');
        }

        return $this->success([
            'reasons' => $this->supportAccess->reasons(),
            'durations' => SupportAccessService::DURATIONS,
        ], 'Motivos carregados com sucesso.');
    }

    public function store(Request $request, Tenant $tenant): JsonResponse
    {
        $user = $request->user();

        if (! $user || ! $user->isSuperAdmin()) {
            return $this->forbidden('Acesso permitido apenas para super admin.');
        }

        if ($tenant->status !== 'active') {
            return $this->validationError(
                ['tenant' => ['Tenant inativo.']],
                'Não é possível acessar um tenant inativo.'
            );
        }

        $validated = $request->validate([
            'reason_id' => ['required', 'integer'],
            'details' => ['nullable', 'string', 'max:500'],
            'duration_minutes' => ['required', 'integer', 'in:' . implode(',', SupportAccessService::DURATIONS)],
        ], [
            'reason_id.required' => 'Escolha o motivo do acesso.',
            'duration_minutes.required' => 'Escolha por quanto tempo o acesso fica aberto.',
            'duration_minutes.in' => 'Duração inválida.',
        ]);

        ['access' => $access, 'token' => $token] = $this->supportAccess->start(
            $user,
            $tenant,
            (int) $validated['reason_id'],
            $validated['details'] ?? null,
            (int) $validated['duration_minutes'],
            $request->ip(),
            $request->userAgent(),
        );

        Log::info('Super admin iniciou acesso de suporte.', [
            'support_access_id' => $access->id,
            'user_id' => $user->id,
            'tenant_id' => $tenant->id,
            'ip' => $request->ip(),
        ]);

        return $this->success([
            'token' => $token,
            'expires_at' => $access->expires_at->toIso8601String(),
            'access' => [
                'id' => $access->id,
                'expires_at' => $access->expires_at->toIso8601String(),
                'duration_minutes' => $access->duration_minutes,
            ],
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
            ],
        ], "Acessando {$tenant->name}.");
    }

    /** Chamado com o token do próprio acesso. */
    public function end(Request $request): JsonResponse
    {
        $access = $request->attributes->get('support_access');

        if (! $access) {
            return $this->validationError(
                ['support_access' => ['Nenhum acesso de suporte em andamento.']],
                'Nenhum acesso de suporte em andamento.'
            );
        }

        $this->supportAccess->end($access);

        return $this->success(null, 'Acesso de suporte encerrado.');
    }

    public function history(Request $request): JsonResponse
    {
        if (! $request->user()?->isSuperAdmin()) {
            return $this->forbidden('Acesso permitido apenas para super admin.');
        }

        $tenant = $request->query('tenant');

        return $this->success([
            'items' => $this->supportAccess->history(is_numeric($tenant) ? (int) $tenant : null),
        ], 'Histórico de acessos carregado com sucesso.');
    }

    /** Abre o app web na conta do aluno. O painel recebe um link de uso único, sem a senha. */
    public function startMobile(Request $request, Student $student): JsonResponse
    {
        $user = $request->user();

        if (! $user || ! $user->isSuperAdmin()) {
            return $this->forbidden('Acesso permitido apenas para super admin.');
        }

        $validated = $request->validate([
            'reason_id' => ['required', 'integer'],
            'details' => ['nullable', 'string', 'max:500'],
            'duration_minutes' => ['required', 'integer', 'in:' . implode(',', SupportAccessService::DURATIONS)],
        ], [
            'reason_id.required' => 'Escolha o motivo do acesso.',
            'duration_minutes.required' => 'Escolha por quanto tempo o acesso fica aberto.',
            'duration_minutes.in' => 'Duração inválida.',
        ]);

        ['access' => $access, 'launch_url' => $launchUrl] = $this->supportAccess->startForStudent(
            $user,
            $student,
            (int) $validated['reason_id'],
            $validated['details'] ?? null,
            (int) $validated['duration_minutes'],
            $request->ip(),
            $request->userAgent(),
        );

        Log::info('Super admin iniciou acesso ao app do aluno.', [
            'support_access_id' => $access->id,
            'user_id' => $user->id,
            'student_id' => $student->id,
            'tenant_id' => $student->tenant_id,
            'ip' => $request->ip(),
        ]);

        return $this->success([
            'launch_url' => $launchUrl,
            'expires_at' => $access->expires_at->toIso8601String(),
            'student' => [
                'id' => $student->id,
                'name' => $student->name,
            ],
        ], "Abrindo o app de {$student->name}.");
    }

    /** Público: troca o código do link pelo token da conta do aluno. Uso único. */
    public function redeemMobile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:80'],
        ], [
            'code.required' => 'Código de acesso ausente.',
        ]);

        $plain = $this->supportAccess->redeemHandoff($validated['code']);
        $stored = $plain ? PersonalAccessToken::findToken($plain) : null;
        $tokenUser = $stored?->tokenable;
        $accessId = $this->supportAccess->accessIdFromToken($stored);
        $access = ($accessId && $tokenUser instanceof User)
            ? $this->supportAccess->activeAccess($accessId, $tokenUser)
            : null;

        if (! $plain || ! $stored || ! $access || ! $access->impersonated_user_id) {
            if ($stored) {
                $stored->delete();
            }

            return $this->validationError(
                ['code' => ['Este acesso expirou ou já foi usado. Abra de novo a partir do aluno.']],
                'Este acesso expirou ou já foi usado.'
            );
        }

        $tokenUser->loadMissing(['tenant', 'student']);
        $payload = (new UserResource($tokenUser))->resolve($request);
        $payload['password_change_required'] = false;
        $payload['support_access'] = [
            'expires_at' => $access->expires_at->toIso8601String(),
        ];

        return $this->success([
            'token' => $plain,
            'expires_at' => $access->expires_at->toIso8601String(),
            'user' => $payload,
            'support_access' => $payload['support_access'],
        ], 'Acesso ao app do aluno iniciado.');
    }
}
