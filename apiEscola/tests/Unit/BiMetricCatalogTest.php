<?php

namespace Tests\Unit;

use App\Services\Bi\BiFilters;
use App\Services\Bi\MetricCatalog;
use Tests\TestCase;

class BiMetricCatalogTest extends TestCase
{
    public function test_every_metric_documents_formula_source_and_missing_data_rule(): void
    {
        foreach ((new MetricCatalog)->all() as $metric) {
            foreach (['name', 'description', 'formula', 'sources', 'unit', 'min_sample', 'missing', 'filters', 'plan'] as $field) {
                $this->assertArrayHasKey($field, $metric, "{$metric['key']} sem {$field}");
            }
            $this->assertContains($metric['unit'], [MetricCatalog::UNIT_PCT, MetricCatalog::UNIT_COUNT]);
        }
    }

    public function test_insufficient_sample_returns_null_not_zero(): void
    {
        $metric = (new MetricCatalog)->make('practice.first_accuracy', 40.0, 3);

        $this->assertNull($metric['value']);
        $this->assertFalse($metric['sufficient']);
        $this->assertSame(3, $metric['sample']['size']);
    }

    public function test_percentage_delta_is_in_percentage_points(): void
    {
        $metric = (new MetricCatalog)->make('assessments.avg_pct', 64.25, 40, ['students' => 20], 58.1, 30);

        $this->assertSame(64.3, $metric['value']);
        $this->assertSame(6.2, $metric['delta']);
        $this->assertSame('pp', $metric['delta_unit']);
        $this->assertSame('up', $metric['trend']);
        $this->assertSame(20, $metric['sample']['students']);
    }

    public function test_count_delta_is_relative_percent(): void
    {
        $metric = (new MetricCatalog)->make('students.active', 110, 110, [], 100, 100);

        $this->assertSame(10.0, $metric['delta']);
        $this->assertSame('percent', $metric['delta_unit']);
    }

    public function test_previous_period_with_insufficient_sample_has_no_delta(): void
    {
        $metric = (new MetricCatalog)->make('attendance.rate', 90.0, 20, [], 50.0, 2);

        $this->assertSame(90.0, $metric['value']);
        $this->assertNull($metric['previous']);
        $this->assertNull($metric['delta']);
        $this->assertNull($metric['trend']);
    }

    public function test_small_variation_is_stable(): void
    {
        $metric = (new MetricCatalog)->make('attendance.rate', 80.2, 20, [], 80.0, 20);

        $this->assertSame('stable', $metric['trend']);
    }

    public function test_previous_period_has_same_length_and_ends_before_current(): void
    {
        $filters = BiFilters::fromValidated(['from' => '2026-09-01', 'to' => '2026-09-30', 'school_class_id' => '7']);
        $previous = $filters->previous();

        $this->assertSame(30, $filters->days());
        $this->assertSame('2026-08-02', $previous->from->toDateString());
        $this->assertSame('2026-08-31', $previous->to->toDateString());
        $this->assertSame(7, $previous->schoolClassId);
    }

    public function test_default_period_covers_configured_days(): void
    {
        $filters = BiFilters::fromValidated([]);

        $this->assertSame((int) config('bi.default_period_days'), $filters->days());
    }

    public function test_utc_range_ends_exclusive_after_last_local_day(): void
    {
        [$from, $until] = BiFilters::fromValidated(['from' => '2026-09-01', 'to' => '2026-09-01'])->utcRange();

        $this->assertSame('2026-09-01 03:00:00', $from->format('Y-m-d H:i:s'));
        $this->assertSame('2026-09-02 03:00:00', $until->format('Y-m-d H:i:s'));
    }
}
