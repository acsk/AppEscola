<?php

use App\Models\SaasCompetenceClose;
use App\Services\Saas\SaasCompetenceService;
use Illuminate\Database\Migrations\Migration;

/**
 * O fechamento de janeiro tinha copiado os alunos de hoje.
 * Regrava cada mês já fechado com quem já estava mais quem entrou naquele mês.
 */
return new class extends Migration
{
    public function up(): void
    {
        $service = app(SaasCompetenceService::class);
        SaasCompetenceClose::query()->orderBy('id')->each(function (SaasCompetenceClose $close) use ($service) {
            $service->refreshStoredClose($close);
        });
    }

    public function down(): void
    {
        // A quantidade anterior era a de hoje, repetida em todos os meses. Não há como restaurá-la.
    }
};
