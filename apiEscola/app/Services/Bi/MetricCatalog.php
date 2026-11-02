<?php

namespace App\Services\Bi;

use InvalidArgumentException;

/**
 * Catálogo de métricas (config/bi_metrics.php) e montagem padronizada de cada valor.
 * Regras centralizadas aqui: amostra insuficiente vira null (nunca zero),
 * percentual varia em p.p., índice (0–100) em pontos e contagem em %.
 */
class MetricCatalog
{
    public const UNIT_PCT = 'pct';

    public const UNIT_COUNT = 'count';

    /** Índice de 0 a 100: varia em pontos absolutos. */
    public const UNIT_SCORE = 'score';

    /** Variação abaixo disto é tratada como estável. */
    private const STABLE_DELTA = 0.5;

    /** @return array<string, mixed> */
    public function definition(string $key): array
    {
        // As chaves têm ponto (ex.: practice.first_accuracy): config("bi_metrics.{$key}") quebraria nelas.
        $definition = ((array) config('bi_metrics', []))[$key] ?? null;
        if (! is_array($definition)) {
            throw new InvalidArgumentException("Métrica desconhecida: {$key}");
        }

        return $definition;
    }

    /** @return list<array<string, mixed>> */
    public function all(): array
    {
        $metrics = [];
        foreach ((array) config('bi_metrics', []) as $key => $definition) {
            $metrics[] = ['key' => $key] + $definition;
        }

        return $metrics;
    }

    /**
     * @param  int  $sampleSize  tamanho da amostra comparado ao min_sample da métrica
     * @param  array<string, int>  $sample  detalhamento exibido (ex.: ['students' => 40, 'answers' => 900])
     * @return array<string, mixed>
     */
    public function make(
        string $key,
        ?float $value,
        int $sampleSize,
        array $sample = [],
        ?float $previous = null,
        ?int $previousSampleSize = null,
    ): array {
        $definition = $this->definition($key);
        $minSample = (int) ($definition['min_sample'] ?? 0);
        $unit = $definition['unit'] ?? self::UNIT_PCT;

        $sufficient = $value !== null && $sampleSize >= $minSample;
        $current = $sufficient ? round($value, 1) : null;
        $prior = $previous !== null && ($previousSampleSize ?? 0) >= $minSample ? round($previous, 1) : null;
        $delta = $this->delta($current, $prior, $unit);

        return [
            'key' => $key,
            'value' => $current,
            'unit' => $unit,
            'previous' => $prior,
            'delta' => $delta,
            'delta_unit' => $delta === null ? null : match ($unit) {
                self::UNIT_PCT => 'pp',
                self::UNIT_SCORE => 'pts',
                default => 'percent',
            },
            'trend' => $this->trend($delta),
            'sample' => $sample + ['size' => $sampleSize],
            'min_sample' => $minSample,
            'sufficient' => $sufficient,
        ];
    }

    private function delta(?float $current, ?float $previous, string $unit): ?float
    {
        if ($current === null || $previous === null) {
            return null;
        }
        if ($unit === self::UNIT_PCT || $unit === self::UNIT_SCORE) {
            return round($current - $previous, 1);
        }
        if ($previous == 0.0) {
            return null;
        }

        return round(($current - $previous) / $previous * 100, 1);
    }

    private function trend(?float $delta): ?string
    {
        if ($delta === null) {
            return null;
        }
        if (abs($delta) < self::STABLE_DELTA) {
            return 'stable';
        }

        return $delta > 0 ? 'up' : 'down';
    }
}
