<?php

namespace Tests;

use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Domínios de lookup (status, métodos de pagamento, etc.) exigidos por FKs nas migrations.
     * Testes com RefreshDatabase podem chamar este método em afterRefreshingDatabase().
     */
    protected function seedDomainLookups(): void
    {
        $this->seed(DomainSeeder::class);
    }
}
