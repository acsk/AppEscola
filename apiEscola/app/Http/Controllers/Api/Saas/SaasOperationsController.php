<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Models\SaasAuditLog;
use App\Services\Saas\SaasMonitoringService;
use App\Services\Saas\SaasReportService;
use App\Support\BusinessDate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Super admin: monitoramento, consumo por instituição, relatórios globais e auditoria global. */
class SaasOperationsController extends Controller
{
    public function __construct(
        private readonly SaasMonitoringService $monitoring,
        private readonly SaasReportService $reports,
    ) {
    }

    public function monitoring(): JsonResponse
    {
        return $this->success($this->monitoring->overview(), 'Monitoramento carregado com sucesso.');
    }

    public function usage(): JsonResponse
    {
        return $this->success(['items' => $this->reports->usage()], 'Consumo carregado com sucesso.');
    }

    public function report(Request $request, string $type): JsonResponse
    {
        abort_unless(in_array($type, ['commercial', 'operational', 'retention'], true), 404, 'Relatório desconhecido.');
        $data = $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
        ]);
        $to = isset($data['date_to']) ? Carbon::parse($data['date_to']) : BusinessDate::today();
        $from = isset($data['date_from']) ? Carbon::parse($data['date_from']) : $to->copy()->subDays(29);
        if ($from->diffInDays($to) > 731) {
            return $this->validationError(['date_to' => ['O período pode ter no máximo 2 anos.']], 'O período pode ter no máximo 2 anos.');
        }

        return $this->success($this->reports->report($type, $from->startOfDay(), $to), 'Relatório carregado com sucesso.');
    }

    public function aiUsage(Request $request, \App\Services\Saas\AiCostReportService $ai): JsonResponse
    {
        $data = $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'tenant_id' => ['nullable', 'integer'],
        ]);
        $to = isset($data['date_to']) ? Carbon::parse($data['date_to']) : BusinessDate::today();
        $from = isset($data['date_from']) ? Carbon::parse($data['date_from']) : $to->copy()->startOfMonth();
        if ($from->diffInDays($to) > 366) {
            return $this->validationError(['date_to' => ['O período pode ter no máximo 1 ano.']], 'O período pode ter no máximo 1 ano.');
        }

        return $this->success($ai->build($from->startOfDay(), $to, isset($data['tenant_id']) ? (int) $data['tenant_id'] : null), 'Consumo de IA carregado com sucesso.');
    }

    public function audit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'group' => ['nullable', 'in:tenant,subscription,plan,feature,quota,admin'],
            'tenant_id' => ['nullable', 'integer'],
            'user_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:120'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $page = SaasAuditLog::query()->with(['user:id,name', 'tenant:id,name'])
            ->when($data['group'] ?? null, fn ($q, $v) => $q->where('action', 'like', "{$v}.%"))
            ->when($data['tenant_id'] ?? null, fn ($q, $v) => $q->where('tenant_id', $v))
            ->when($data['user_id'] ?? null, fn ($q, $v) => $q->where('user_id', $v))
            ->when($data['search'] ?? null, fn ($q, $v) => $q->where('description', 'like', "%{$v}%"))
            ->when($data['date_from'] ?? null, fn ($q, $v) => $q->where('created_at', '>=', Carbon::parse($v)->startOfDay()))
            ->when($data['date_to'] ?? null, fn ($q, $v) => $q->where('created_at', '<=', Carbon::parse($v)->endOfDay()))
            ->latest('id')
            ->paginate(30);

        return $this->success([
            'items' => collect($page->items())->map(fn (SaasAuditLog $log) => [
                'id' => $log->id,
                'action' => $log->action,
                'description' => $log->description,
                'tenant' => $log->tenant ? ['id' => $log->tenant->id, 'name' => $log->tenant->name] : null,
                'user' => $log->user?->name,
                'ip' => $log->ip,
                'changes' => $log->changes,
                'created_at' => $log->created_at?->toISOString(),
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ], 'Auditoria carregada com sucesso.');
    }
}
