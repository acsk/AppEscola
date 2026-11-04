<?php

namespace App\Traits;

use App\Support\FinancePermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Permissão financeira + escola selecionada: devolve o tenant_id ou a resposta de erro pronta. */
trait AuthorizesFinance
{
    use ScopedByTenant;

    protected function authorizeFinance(Request $request, string $ability): int|JsonResponse
    {
        if (! FinancePermissions::allows($request->user(), $ability)) {
            return $this->forbidden('Sem permissão para esta ação do financeiro.');
        }

        $tenantId = $this->getTenantId($request);
        if ($tenantId === null) {
            return $this->validationError(
                ['tenant_id' => ['Selecione uma instituição.']],
                'Selecione uma instituição para acessar o financeiro.'
            );
        }

        return $tenantId;
    }
}
