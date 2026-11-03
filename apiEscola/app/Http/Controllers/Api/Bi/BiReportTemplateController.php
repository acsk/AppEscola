<?php

namespace App\Http\Controllers\Api\Bi;

use App\Services\Bi\Reports\BiReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Modelos de relatório salvos: os próprios e os compartilhados da escola. */
class BiReportTemplateController extends BiController
{
    public function index(Request $request): JsonResponse
    {
        $scope = $this->scope($request);

        $items = DB::table('bi_report_templates as t')
            ->leftJoin('users as u', 'u.id', '=', 't.user_id')
            ->where('t.tenant_id', $scope->tenantId)
            ->where(fn ($q) => $q->where('t.user_id', $scope->userId)->orWhere('t.shared', true))
            ->orderBy('t.name')
            ->get(['t.id', 't.name', 't.report', 't.config', 't.shared', 't.user_id', 'u.name as owner', 't.updated_at'])
            ->map(fn ($t) => [
                'id' => $t->id,
                'name' => $t->name,
                'report' => $t->report,
                'config' => json_decode($t->config, true),
                'shared' => (bool) $t->shared,
                'owner' => $t->owner,
                'mine' => (int) $t->user_id === $scope->userId,
            ]);

        return $this->success(['items' => $items], 'Modelos carregados.');
    }

    public function store(Request $request): JsonResponse
    {
        $scope = $this->scope($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'report' => ['required', Rule::in(BiReportService::TYPES)],
            'config' => ['required', 'array'],
            'config.executive_summary' => ['nullable', 'string', 'max:4000'],
            'shared' => ['boolean'],
        ]);

        $id = DB::table('bi_report_templates')->insertGetId([
            'tenant_id' => $scope->tenantId,
            'user_id' => $scope->userId,
            'name' => $data['name'],
            'report' => $data['report'],
            // `validate()` só devolve as chaves de config com regra própria; o restante (indicadores, opções) vem da requisição.
            'config' => json_encode($request->input('config')),
            // Só a coordenação compartilha com a escola.
            'shared' => $scope->isTenantWide() && ($data['shared'] ?? false),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->created(['id' => $id], 'Modelo salvo.');
    }

    public function destroy(Request $request, int $template): JsonResponse
    {
        $scope = $this->scope($request);
        $row = DB::table('bi_report_templates')->where('tenant_id', $scope->tenantId)->where('id', $template)->first();
        if (! $row) {
            return $this->error('Modelo não encontrado.', null, 404);
        }
        if ((int) $row->user_id !== $scope->userId && ! $scope->isTenantWide()) {
            return $this->forbidden('Só quem criou o modelo ou a coordenação pode removê-lo.');
        }

        DB::table('bi_report_templates')->where('id', $template)->delete();

        return $this->deleted('Modelo removido.');
    }
}
