<?php

namespace Tests\Unit;

use App\Models\Tenant;
use App\Services\TenantNotificationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class TenantNotificationSettingsServiceTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    public function test_default_calendar_enabled_types_when_not_configured(): void
    {
        $tenant = Tenant::factory()->create();
        $service = app(TenantNotificationSettingsService::class);

        $types = $service->calendarEnabledTypes($tenant);

        $this->assertContains('exam_pending', $types);
        $this->assertContains('general', $types);
    }

    public function test_update_persists_calendar_enabled_types(): void
    {
        $tenant = Tenant::factory()->create();
        $service = app(TenantNotificationSettingsService::class);

        $service->updateCalendarEnabledTypes($tenant, ['exam_pending', 'general']);

        $this->assertTrue($service->isCalendarEnabledForType($tenant, 'exam_pending'));
        $this->assertFalse($service->isCalendarEnabledForType($tenant, 'billing_due'));
    }
}
