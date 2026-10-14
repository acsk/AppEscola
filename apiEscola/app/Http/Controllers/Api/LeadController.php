<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreLeadRequest;
use App\Models\Lead;
use Illuminate\Http\JsonResponse;

class LeadController extends Controller
{
    /** POST /api/leads — pedido de demonstração vindo do site. */
    public function store(StoreLeadRequest $request): JsonResponse
    {
        if (trim((string) $request->input('company_website', '')) !== '') {
            return $this->created(null, 'Recebemos seu pedido. Em breve a equipe entra em contato.');
        }

        Lead::query()->create([
            'name' => $request->string('name')->toString(),
            'email' => $request->string('email')->toString(),
            'phone' => $request->string('phone')->toString(),
            'institution' => $request->string('institution')->toString(),
            'message' => $request->input('message'),
            'source' => 'site',
            'ip' => $request->ip(),
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ]);

        return $this->created(null, 'Recebemos seu pedido. Em breve a equipe entra em contato.');
    }
}
