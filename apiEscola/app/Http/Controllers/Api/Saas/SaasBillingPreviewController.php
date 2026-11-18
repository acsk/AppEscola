<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Services\Saas\SaasBillingPreviewService;
use Illuminate\Http\JsonResponse;

class SaasBillingPreviewController extends Controller
{
    public function __construct(private readonly SaasBillingPreviewService $preview)
    {
    }

    public function index(): JsonResponse
    {
        return $this->success($this->preview->preview(), 'Prévia de cobrança carregada com sucesso.');
    }
}
