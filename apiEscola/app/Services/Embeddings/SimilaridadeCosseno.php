<?php

namespace App\Services\Embeddings;

class SimilaridadeCosseno
{
    /**
     * @param  list<float>  $a
     * @param  list<float>  $b
     */
    public function calcular(array $a, array $b): ?float
    {
        if ($a === [] || count($a) !== count($b)) {
            return null;
        }

        $dot = 0.0;
        $na = 0.0;
        $nb = 0.0;
        foreach ($a as $i => $valor) {
            $x = (float) $valor;
            $y = (float) $b[$i];
            $dot += $x * $y;
            $na += $x * $x;
            $nb += $y * $y;
        }
        if ($na <= 0.0 || $nb <= 0.0) {
            return null;
        }

        return $dot / (sqrt($na) * sqrt($nb));
    }
}
