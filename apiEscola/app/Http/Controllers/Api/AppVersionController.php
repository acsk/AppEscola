<?php

namespace App\Http\Controllers\Api;

use App\Models\AppVersion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class AppVersionController extends Controller
{
    // ── GET ───────────────────────────────────────────────────────────────────

    public function panel(): JsonResponse
    {
        return $this->versionResponse('panel');
    }

    public function mobile(): JsonResponse
    {
        return $this->versionResponse('mobile');
    }

    // ── POST ──────────────────────────────────────────────────────────────────

    public function updatePanel(Request $request): JsonResponse
    {
        return $this->storeVersion('panel', $request);
    }

    public function updateMobile(Request $request): JsonResponse
    {
        return $this->storeVersion('mobile', $request);
    }

    // ── Internos ──────────────────────────────────────────────────────────────

    private function versionResponse(string $app): JsonResponse
    {
        $row = AppVersion::where('app', $app)->first();

        if ($row) {
            $version      = $row->formatted_version;
            $release_date = $row->release_date->format('Y-m-d');
        } else {
            $cfg          = config("app_versions.{$app}");
            $version      = sprintf('v%d.%d', (int) $cfg['version'], (int) $cfg['release']);
            $release_date = $cfg['release_date'];
        }

        return response()->json([
            'type'    => 'success',
            'message' => 'Versão carregada com sucesso.',
            'body'    => [
                'app'          => $app,
                'version'      => $version,
                'release_date' => $release_date,
            ],
        ]);
    }

    private function storeVersion(string $app, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'version'      => ['required', 'integer', 'min:0'],
            'release'      => ['required', 'integer', 'min:0'],
            'release_date' => ['required', 'date_format:Y-m-d'],
        ]);

        $row = AppVersion::updateOrCreate(
            ['app' => $app],
            $validated,
        );

        return response()->json([
            'type'    => 'success',
            'message' => 'Versão atualizada com sucesso.',
            'body'    => [
                'app'          => $app,
                'version'      => $row->formatted_version,
                'release_date' => $row->release_date->format('Y-m-d'),
            ],
        ]);
    }
}

