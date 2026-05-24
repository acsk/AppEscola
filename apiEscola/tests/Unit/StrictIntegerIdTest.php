<?php

namespace Tests\Unit;

use App\Support\StrictIntegerId;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class StrictIntegerIdTest extends TestCase
{
    #[DataProvider('rejectedValuesProvider')]
    public function test_parse_positive_rejects_non_integer_values(mixed $value): void
    {
        $this->assertNull(StrictIntegerId::parsePositive($value));
    }

    public static function rejectedValuesProvider(): array
    {
        return [
            'boolean true' => [true],
            'boolean false' => [false],
            'float' => [1.5],
            'non numeric string' => ['abc'],
            'decimal string' => ['1.0'],
            'zero int' => [0],
            'negative int' => [-1],
        ];
    }

    #[DataProvider('acceptedValuesProvider')]
    public function test_parse_positive_accepts_explicit_integers(mixed $value, int $expected): void
    {
        $this->assertSame($expected, StrictIntegerId::parsePositive($value));
    }

    public static function acceptedValuesProvider(): array
    {
        return [
            'positive int' => [5, 5],
            'numeric string' => ['12', 12],
        ];
    }

    public function test_parse_positive_list_ignores_booleans(): void
    {
        $this->assertSame([2, 3], StrictIntegerId::parsePositiveList([true, 2, false, '3']));
    }
}
