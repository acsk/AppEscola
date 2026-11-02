<?php

namespace App\Services\Bi\Sources;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Estado de bi_answer_facts por tenant: as fontes só leem dela depois da 1ª geração completa. */
class AnswerFacts
{
    public const SOURCE_ONLINE = 'online';

    public const SOURCE_PRACTICE = 'practice';

    /** @var array<int, object|null> */
    private array $state = [];

    public function ready(int $tenantId): bool
    {
        return $this->state($tenantId)?->full_refreshed_at !== null;
    }

    /** Até quando as respostas estão consolidadas (null = cálculo ao vivo). */
    public function refreshedAt(int $tenantId): ?Carbon
    {
        $at = $this->ready($tenantId) ? $this->state($tenantId)->refreshed_at : null;

        return $at ? Carbon::parse($at, 'UTC') : null;
    }

    /** Descarta o estado lido (depois de uma geração no mesmo processo). */
    public function forget(): void
    {
        $this->state = [];
    }

    private function state(int $tenantId): ?object
    {
        return array_key_exists($tenantId, $this->state)
            ? $this->state[$tenantId]
            : $this->state[$tenantId] = DB::table('bi_fact_refreshes')->where('tenant_id', $tenantId)->first();
    }
}
