<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StudentNotificationResource;
use App\Models\Student;
use App\Models\StudentNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentNotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        [$user, $error] = $this->resolveAluno($request);
        if ($error) {
            return $error;
        }

        $query = StudentNotification::query()
            ->where('user_id', $user->id)
            ->where('tenant_id', $user->tenant_id)
            ->orderByDesc('created_at');

        if ($request->boolean('unread_only')) {
            $query->whereNull('read_at');
        }

        $perPage = min(max((int) $request->query('per_page', 20), 1), 50);
        $paginator = $query->paginate($perPage);

        return $this->success([
            'items' => StudentNotificationResource::collection($paginator->items()),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
                'last_page'    => $paginator->lastPage(),
            ],
            'unread_count' => $this->unreadCountFor($user->id, (int) $user->tenant_id),
        ], 'Notificações carregadas com sucesso.');
    }

    public function unreadCount(Request $request): JsonResponse
    {
        [$user, $error] = $this->resolveAluno($request);
        if ($error) {
            return $error;
        }

        return $this->success([
            'unread_count' => $this->unreadCountFor($user->id, (int) $user->tenant_id),
        ]);
    }

    public function show(Request $request, StudentNotification $notification): JsonResponse
    {
        [$user, $error] = $this->resolveAluno($request);
        if ($error) {
            return $error;
        }

        if (! $this->belongsToUser($notification, $user)) {
            return $this->notFound('Notificação não encontrada.');
        }

        $notification->markAsRead();

        return $this->success(
            new StudentNotificationResource($notification->fresh()),
            'Notificação carregada com sucesso.'
        );
    }

    public function markAsRead(Request $request, StudentNotification $notification): JsonResponse
    {
        [$user, $error] = $this->resolveAluno($request);
        if ($error) {
            return $error;
        }

        if (! $this->belongsToUser($notification, $user)) {
            return $this->notFound('Notificação não encontrada.');
        }

        $notification->markAsRead();

        return $this->success(
            new StudentNotificationResource($notification->fresh()),
            'Notificação marcada como lida.'
        );
    }

    public function markAllAsRead(Request $request): JsonResponse
    {
        [$user, $error] = $this->resolveAluno($request);
        if ($error) {
            return $error;
        }

        $updated = StudentNotification::query()
            ->where('user_id', $user->id)
            ->where('tenant_id', $user->tenant_id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return $this->success([
            'marked_count' => $updated,
            'unread_count' => 0,
        ], 'Todas as notificações foram marcadas como lidas.');
    }

    private function unreadCountFor(int $userId, int $tenantId): int
    {
        return StudentNotification::query()
            ->where('user_id', $userId)
            ->where('tenant_id', $tenantId)
            ->whereNull('read_at')
            ->count();
    }

    private function belongsToUser(StudentNotification $notification, $user): bool
    {
        return (int) $notification->user_id === (int) $user->id
            && (int) $notification->tenant_id === (int) $user->tenant_id;
    }

    /**
     * @return array{0: \App\Models\User|null, 1: JsonResponse|null}
     */
    private function resolveAluno(Request $request): array
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return [null, $this->forbidden('Este endpoint é exclusivo para alunos.')];
        }

        $studentExists = Student::query()
            ->where('user_id', $user->id)
            ->where('tenant_id', $user->tenant_id)
            ->where('status', 'active')
            ->exists();

        if (! $studentExists) {
            return [null, $this->forbidden('Aluno não encontrado ou inativo.')];
        }

        return [$user, null];
    }
}
