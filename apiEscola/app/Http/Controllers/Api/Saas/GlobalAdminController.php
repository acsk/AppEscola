<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Saas\GlobalAdminService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class GlobalAdminController extends Controller
{
    public function __construct(private readonly GlobalAdminService $admins)
    {
    }

    public function index(): JsonResponse
    {
        return $this->success(['items' => $this->admins->list()], 'Administradores carregados com sucesso.');
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ], [], ['name' => 'nome', 'password' => 'senha provisória']);
        $admin = $this->admins->create($data, $request->user());

        return $this->created(['id' => $admin->id], 'Administrador criado. Ele deve trocar a senha no primeiro acesso.');
    }

    public function updateStatus(Request $request, User $admin): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:active,inactive']]);
        $this->admins->setStatus($admin, $data['status'], $request->user());

        return $this->success(null, $data['status'] === 'active' ? 'Administrador desbloqueado.' : 'Administrador bloqueado e sessões encerradas.');
    }

    public function resetPassword(Request $request, User $admin): JsonResponse
    {
        $data = $request->validate(['password' => ['required', 'string', 'min:8', 'confirmed']], [], ['password' => 'senha provisória']);
        $this->admins->resetPassword($admin, $data['password'], $request->user());

        return $this->success(null, 'Senha provisória definida. O administrador deve trocá-la no próximo acesso.');
    }

    public function sessions(User $admin): JsonResponse
    {
        return $this->success(['items' => $this->admins->sessions($admin)], 'Sessões carregadas com sucesso.');
    }

    public function revokeSessions(Request $request, User $admin): JsonResponse
    {
        $data = $request->validate(['session_id' => ['nullable', 'integer']]);
        $count = $this->admins->revokeSessions($admin, $data['session_id'] ?? null, $request->user());

        return $this->success(['revoked' => $count], $count ? 'Sessões encerradas.' : 'Nenhuma sessão para encerrar.');
    }
}
