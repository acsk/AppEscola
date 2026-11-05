<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Models\SaasAlert;
use App\Services\Saas\SaasAlertService;
use App\Services\Saas\SaasInsightsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/** Super admin: indicadores avançados, projeções, saúde das instituições e alertas operacionais. */
class SaasInsightsController extends Controller
{
    public function __construct(
        private readonly SaasInsightsService $insights,
        private readonly SaasAlertService $alerts,
    ) {
    }

    public function insights(): JsonResponse
    {
        return $this->success($this->insights->insights(), 'Indicadores carregados com sucesso.');
    }

    public function health(): JsonResponse
    {
        return $this->success($this->insights->health(), 'Saúde das instituições carregada com sucesso.');
    }

    public function alerts(Request $request): JsonResponse
    {
        $data = $request->validate(['status' => ['nullable', 'in:open,acknowledged,resolved,active']]);
        $status = $data['status'] ?? 'active';

        $items = SaasAlert::query()->with(['tenant:id,name', 'acknowledger:id,name'])
            ->when($status === 'active', fn ($q) => $q->whereIn('status', ['open', 'acknowledged']), fn ($q) => $q->where('status', $status))
            ->orderByRaw("case severity when 'critical' then 0 when 'warning' then 1 else 2 end")
            ->latest('last_seen_at')->limit(200)->get()
            ->map(fn (SaasAlert $a) => [
                'id' => $a->id,
                'rule' => $a->rule,
                'severity' => $a->severity,
                'status' => $a->status,
                'title' => $a->title,
                'detail' => $a->detail,
                'tenant' => $a->tenant ? ['id' => $a->tenant->id, 'name' => $a->tenant->name] : null,
                'occurrences' => $a->occurrences,
                'first_seen_at' => $a->first_seen_at?->toISOString(),
                'last_seen_at' => $a->last_seen_at?->toISOString(),
                'resolved_at' => $a->resolved_at?->toISOString(),
                'acknowledged_by' => $a->acknowledger?->name,
                'acknowledged_at' => $a->acknowledged_at?->toISOString(),
                'notified_at' => $a->notified_at?->toISOString(),
            ]);

        return $this->success([
            'items' => $items,
            'counts' => SaasAlert::query()->whereIn('status', ['open', 'acknowledged'])->selectRaw('severity, count(*) as total')->groupBy('severity')->pluck('total', 'severity'),
            'emails_enabled' => (bool) config('saas.alert_emails'),
        ], 'Alertas carregados com sucesso.');
    }

    public function acknowledge(Request $request, SaasAlert $alert): JsonResponse
    {
        $this->alerts->acknowledge($alert, $request->user());

        return $this->success(null, 'Alerta reconhecido.');
    }

    /** Reavalia agora (sem esperar a próxima hora). Não reenvia e-mails já enviados. */
    public function runAlerts(): JsonResponse
    {
        if (! Cache::add('saas:alerts:manual-run', true, 60)) {
            return $this->error('Os alertas foram reavaliados há menos de um minuto.', null, 429);
        }
        $result = $this->alerts->run();

        return $this->success($result, "Alertas reavaliados: {$result['opened']} novos, {$result['resolved']} resolvidos.");
    }
}
