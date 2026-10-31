<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Controllers\Controller;
use App\Http\Requests\Bi\BiFilterRequest;
use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\BiFilters;
use App\Traits\ScopedByTenant;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;

/** Base dos endpoints /bi: tenant, papel, recurso habilitado e filtros dentro do escopo. */
abstract class BiController extends Controller
{
    use ScopedByTenant;

    public function __construct(protected readonly BiFeatureGate $gate)
    {
    }

    protected function scope(Request $request, string $requiredPlan = BiFeatureGate::PLAN_BASIC): BiAccessScope
    {
        $user = $request->user();

        if (! BiAccessScope::canAccess($user)) {
            throw new HttpResponseException($this->forbidden('Sem permissão para acessar a Inteligência Educacional.'));
        }

        $tenantId = $this->getTenantId($request);
        if ($tenantId === null) {
            throw new HttpResponseException($this->error('Informe o tenant para acessar a Inteligência Educacional.', null, 422));
        }

        if (! $this->gate->allows($this->gate->settings($tenantId), $requiredPlan)) {
            throw new HttpResponseException($this->error(
                'Recurso da Inteligência Educacional não habilitado para esta escola.',
                ['code' => 'bi_feature_disabled'],
                403,
            ));
        }

        return BiAccessScope::for($user, $tenantId);
    }

    /** Filtros validados; turma ou professor fora do escopo do usuário são recusados. */
    protected function filters(BiFilterRequest $request, BiAccessScope $scope): BiFilters
    {
        $filters = BiFilters::fromValidated($request->validated());

        if ($filters->schoolClassId !== null && ! $scope->allowsClass($filters->schoolClassId)) {
            throw new HttpResponseException($this->forbidden('Turma fora do seu escopo de acesso.'));
        }

        if (! $scope->isTenantWide() && $filters->teacherId !== null && $filters->teacherId !== $request->user()->id) {
            throw new HttpResponseException($this->forbidden('Filtro por professor disponível apenas para a coordenação.'));
        }

        return $filters;
    }
}
