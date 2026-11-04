<?php

namespace App\Console\Commands;

use App\Services\Saas\SaasSubscriptionService;
use Illuminate\Console\Command;

class ExpireSaasSubscriptions extends Command
{
    protected $signature = 'saas:expire-subscriptions';

    protected $description = 'Marca testes vencidos como expirados e assinaturas com vencimento passado como em atraso';

    public function handle(SaasSubscriptionService $subscriptions): int
    {
        $counts = $subscriptions->expireOverdue();
        $this->info("Testes expirados: {$counts['expired']} · em atraso: {$counts['past_due']}");

        return self::SUCCESS;
    }
}
