<?php

namespace Tests\Concerns;

use Database\Seeders\DomainSeeder;

/**
 * Popula tabelas de domínio após RefreshDatabase (FK em status, role, etc.).
 */
trait SeedsDomainLookups
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
    }
}
