<?php

namespace App\Console\Commands;

use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\Facts\AnswerFactsBuilder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Atualiza bi_answer_facts (1ª tentativa já resolvida) dos tenants com a Inteligência Educacional ativa. */
class RefreshBiFactsCommand extends Command
{
    protected $signature = 'bi:refresh-facts {--tenant=* : Só estes tenants} {--full : Regera tudo (padrão: só alunos com novidade)}';

    protected $description = 'Atualiza os fatos de respostas do BI; incremental a cada 10 minutos e completo de madrugada';

    public function handle(AnswerFactsBuilder $builder, BiFeatureGate $gate): int
    {
        $tenants = $this->option('tenant')
            ? array_map('intval', $this->option('tenant'))
            : DB::table('tenants')->whereNull('deleted_at')->pluck('id')->map(fn ($id) => (int) $id)->all();

        foreach ($tenants as $tenantId) {
            if (! $gate->settings($tenantId)['enabled']) {
                continue;
            }

            $result = $builder->refresh($tenantId, (bool) $this->option('full'));
            $this->line($result === null
                ? "Tenant {$tenantId}: já em atualização, ignorado."
                : "Tenant {$tenantId}: {$result['mode']}, {$result['students']} aluno(s), {$result['rows']} linha(s), {$result['ms']} ms.");
        }

        return self::SUCCESS;
    }
}
