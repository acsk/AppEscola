<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class TenantAccessFlowProbeTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    public function test_probe(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        $sa = User::factory()->superAdmin()->create(['status' => 'active']);
        $saToken = $sa->createToken('api-token')->plainTextToken;
        $token = $this->withToken($saToken)->postJson("/api/tenants/{$tenant->id}/access")->json('body.token');
        $this->app['auth']->forgetGuards();
        foreach (['/api/me', '/api/dashboard', '/api/bi/meta', '/api/students', '/api/invoices', '/api/finance/dashboard'] as $url) {
            $r = $this->withToken($token)->getJson($url . (str_contains($url, '?') ? '&' : '?') . "tenant_id={$tenant->id}");
            fwrite(STDERR, $url . ' => ' . $r->status() . ' ' . substr($r->getContent(), 0, 160) . PHP_EOL);
            $this->app['auth']->forgetGuards();
        }
        $this->assertTrue(true);
    }
}
