<?php

namespace App\Http\Controllers\Api\Bi;

use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\BiMetaService;
use App\Services\Bi\MetricCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BiMetaController extends BiController
{
    public function __construct(
        BiFeatureGate $gate,
        private readonly BiMetaService $meta,
        private readonly MetricCatalog $catalog,
    ) {
        parent::__construct($gate);
    }

    /** Recursos habilitados, escopo do usuário e opções de filtro. */
    public function show(Request $request): JsonResponse
    {
        $scope = $this->scope($request);

        return $this->success($this->meta->build($request->user(), $scope), 'Inteligência Educacional carregada.');
    }

    /** Catálogo de métricas: nome, fórmula, fontes, amostra mínima e tratamento de ausentes. */
    public function metrics(Request $request): JsonResponse
    {
        $this->scope($request);

        return $this->success(['metrics' => $this->catalog->all()], 'Catálogo de métricas carregado.');
    }
}
