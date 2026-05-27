<?php

namespace Tests\Unit;

use App\Models\Tenant;
use App\Services\TenantMobileThemeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class TenantMobileThemeServiceTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    public function test_effective_colors_use_default_template_when_not_configured(): void
    {
        $tenant = Tenant::factory()->create();
        $service = app(TenantMobileThemeService::class);

        $colors = $service->effectiveColors($tenant);

        $this->assertSame('default', $service->persistedTemplateId($tenant));
        $this->assertSame('#4F46E5', $colors['primary']);
        $this->assertSame('#C7D2FE', $colors['drawer_section_label']);
        $this->assertSame('#FFFFFF', $colors['menu_button_background']);
    }

    public function test_apply_template_persists_template_and_uses_its_palette(): void
    {
        $tenant = Tenant::factory()->create();
        $service = app(TenantMobileThemeService::class);

        $service->applyTemplate($tenant, 'emerald', clearOverrides: true);

        $effective = $service->effectiveColors($tenant->fresh());

        $this->assertSame('emerald', $service->persistedTemplateId($tenant->fresh()));
        $this->assertSame('#16A34A', $effective['primary']);
        $this->assertSame('#BBF7D0', $effective['drawer_section_label']);
        $this->assertSame('#15803D', $effective['menu_button_text']);
    }

    public function test_conectivo_template_matches_brand_palette(): void
    {
        $tenant = Tenant::factory()->create();
        $service = app(TenantMobileThemeService::class);

        $service->applyTemplate($tenant, 'conectivo', clearOverrides: true);
        $effective = $service->effectiveColors($tenant->fresh());

        $this->assertSame('conectivo', $service->persistedTemplateId($tenant->fresh()));
        $this->assertSame('#1B2F4B', $effective['primary']);
        $this->assertSame('#F59E0B', $effective['drawer_section_label']);
        $this->assertSame('#22C55E', $effective['menu_button_active_text']);
        $this->assertSame('#FFFFFF', $effective['menu_button_background']);
        $this->assertSame('#F59E0B', $effective['debit']);
    }

    public function test_color_overrides_apply_on_top_of_template(): void
    {
        $tenant = Tenant::factory()->create();
        $service = app(TenantMobileThemeService::class);

        $service->applyTemplate($tenant, 'emerald', clearOverrides: true);
        $service->updateColors($tenant, ['menu_button_text' => '#000000']);

        $effective = $service->effectiveColors($tenant->fresh());

        $this->assertSame('#16A34A', $effective['primary']);
        $this->assertSame('#000000', $effective['menu_button_text']);
    }

    public function test_reset_removes_template_and_overrides(): void
    {
        $tenant = Tenant::factory()->create();
        $service = app(TenantMobileThemeService::class);

        $service->applyTemplate($tenant, 'ruby', clearOverrides: true);
        $service->resetColors($tenant);

        $this->assertSame('default', $service->persistedTemplateId($tenant->fresh()));
        $this->assertSame([], $service->persistedColorOverrides($tenant->fresh()));
        $this->assertSame('#4F46E5', $service->effectiveColors($tenant->fresh())['primary']);
    }
}
