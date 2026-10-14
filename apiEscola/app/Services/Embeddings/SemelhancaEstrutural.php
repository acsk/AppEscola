<?php

namespace App\Services\Embeddings;

/**
 * Compara o esqueleto da questão depois de mascarar números e nomes.
 * Serve para pegar a mesma conta com outros personagens, sem chamar uma LLM.
 */
class SemelhancaEstrutural
{
    /** @var list<string> */
    private const NOMES = [
        'joao', 'joão', 'maria', 'pedro', 'ana', 'lucas', 'julia', 'júlia', 'carlos', 'paulo',
        'fernanda', 'bruno', 'rafael', 'gabriel', 'beatriz', 'larissa', 'mateus', 'sofia',
    ];

    public function textual(string $a, string $b): float
    {
        $ta = $this->palavras($a, false);
        $tb = $this->palavras($b, false);
        if ($ta === [] || $tb === []) {
            return 0.0;
        }
        $inter = count(array_intersect($ta, $tb));
        $uniao = count(array_unique([...$ta, ...$tb]));

        return $uniao === 0 ? 0.0 : $inter / $uniao;
    }

    public function indice(string $a, string $b): float
    {
        $ta = $this->tokens($a);
        $tb = $this->tokens($b);
        if ($ta === [] || $tb === []) {
            return 0.0;
        }
        $inter = count(array_intersect($ta, $tb));
        $uniao = count(array_unique([...$ta, ...$tb]));

        return $uniao === 0 ? 0.0 : $inter / $uniao;
    }

    /** @return list<string> */
    private function tokens(string $texto): array
    {
        return $this->palavras($texto, true);
    }

    /** @return list<string> */
    private function palavras(string $texto, bool $mascarar): array
    {
        $texto = mb_strtolower($texto);
        if ($mascarar) {
            $texto = preg_replace('/\d+(?:[.,]\d+)?/u', '#', $texto) ?? $texto;
        }
        $texto = preg_replace('/[^\p{L}\p{N}#\s]+/u', ' ', $texto) ?? $texto;
        $partes = preg_split('/\s+/u', trim($texto)) ?: [];
        $partes = array_values(array_filter(
            $partes,
            fn (string $t) => $t !== '' && ! ($mascarar && in_array($t, self::NOMES, true)) && (mb_strlen($t) > 2 || $t === '#')
        ));

        return array_values(array_unique($partes));
    }
}
