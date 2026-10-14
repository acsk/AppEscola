<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;

class SiteController extends Controller
{
    /** GET /api/site/clients — logos públicas das escolas ativas. */
    public function clients(): JsonResponse
    {
        $clients = Tenant::query()
            ->where('status', 'active')
            ->whereNotNull('photo_url')
            ->where('photo_url', '!=', '')
            ->orderBy('trade_name')
            ->orderBy('name')
            ->get(['trade_name', 'name', 'photo_url'])
            ->map(function (Tenant $tenant) {
                $logo = trim((string) $tenant->photo_url);
                if ($logo !== '' && ! str_starts_with($logo, 'http://') && ! str_starts_with($logo, 'https://')) {
                    $logo = url($logo);
                }

                return [
                    'name' => $tenant->trade_name ?: $tenant->name,
                    'logo_url' => $logo,
                ];
            })
            ->filter(fn (array $client) => $client['name'] !== null && $client['name'] !== '' && $client['logo_url'] !== '')
            ->values();

        return $this->success(['clients' => $clients], 'Clientes carregados.');
    }
}
