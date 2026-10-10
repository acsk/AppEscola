<?php

namespace App\Services\Ai;

use App\Support\QuestionRichText;

/**
 * Compara alternativas por grandeza, não pelo texto.
 * 25,5 km, 25.500 m e 25,500 km são a mesma medida.
 * Quando a comparação não se aplica, não devolve problema: ausência de problema não é aprovação.
 */
class ValidacaoMatematicaService
{
    /** @var array<string, array{0: string, 1: float}> */
    private const UNIDADES = [
        'km' => ['m', 1000],
        'quilometro' => ['m', 1000],
        'quilometros' => ['m', 1000],
        'm' => ['m', 1],
        'metro' => ['m', 1],
        'metros' => ['m', 1],
        'cm' => ['m', 0.01],
        'centimetro' => ['m', 0.01],
        'centimetros' => ['m', 0.01],
        'mm' => ['m', 0.001],
        'milimetro' => ['m', 0.001],
        'milimetros' => ['m', 0.001],
        'kg' => ['g', 1000],
        'quilograma' => ['g', 1000],
        'quilogramas' => ['g', 1000],
        'g' => ['g', 1],
        'grama' => ['g', 1],
        'gramas' => ['g', 1],
        'mg' => ['g', 0.001],
        'l' => ['l', 1],
        'litro' => ['l', 1],
        'litros' => ['l', 1],
        'ml' => ['l', 0.001],
        'h' => ['s', 3600],
        'hora' => ['s', 3600],
        'horas' => ['s', 3600],
        'min' => ['s', 60],
        'minuto' => ['s', 60],
        'minutos' => ['s', 60],
        's' => ['s', 1],
        'seg' => ['s', 1],
        'segundo' => ['s', 1],
        'segundos' => ['s', 1],
    ];

    /**
     * @param  array<int, array<string, mixed>>  $options
     * @return array<int, array{tipo: string, gravidade: string, descricao: string}>
     */
    public static function problemas(array $options): array
    {
        $medidas = [];
        foreach (array_values($options) as $index => $option) {
            if (! is_array($option) || $index > 25) {
                continue;
            }
            $texto = QuestionRichText::plain((string) ($option['option_text'] ?? $option['text'] ?? ''));
            $quantidade = self::quantidade($texto);
            if ($quantidade === null) {
                continue;
            }
            $medidas[] = [
                'letra' => chr(65 + $index),
                'dimensao' => $quantidade['dimensao'],
                'valor' => $quantidade['valor'],
            ];
        }

        $problemas = [];
        $grupos = self::agrupar($medidas);
        foreach ($grupos as $grupo) {
            if (count($grupo) < 2) {
                continue;
            }
            $letras = implode(', ', array_map(fn (array $item) => $item['letra'], $grupo));
            $problemas[] = [
                'tipo' => 'ambiguidade',
                'gravidade' => 'alta',
                'descricao' => "As alternativas {$letras} representam a mesma grandeza.",
            ];
        }

        return $problemas;
    }

    /**
     * Uma única grandeza no texto. Vários números ou nenhuma unidade reconhecível devolvem null.
     *
     * @return array{dimensao: string, valor: float}|null
     */
    public static function quantidade(string $texto): ?array
    {
        $texto = trim(preg_replace('/\s+/u', ' ', $texto) ?? $texto);
        if ($texto === '' || ! preg_match_all(self::padrao(), $texto, $encontrados, PREG_SET_ORDER)) {
            return null;
        }
        if (count($encontrados) !== 1) {
            return null;
        }

        $numero = self::numero($encontrados[0]['valor']);
        if ($numero === null) {
            return null;
        }

        $unidade = self::unidade($encontrados[0]['unidade'] ?? '');
        if ($unidade === null) {
            return ['dimensao' => 'numero', 'valor' => $numero];
        }

        return [
            'dimensao' => $unidade[0],
            'valor' => $numero * $unidade[1],
        ];
    }

    /**
     * @param  array<int, array{letra: string, dimensao: string, valor: float}>  $medidas
     * @return array<int, array<int, array{letra: string, dimensao: string, valor: float}>>
     */
    private static function agrupar(array $medidas): array
    {
        $grupos = [];
        foreach ($medidas as $medida) {
            $encaixou = false;
            foreach ($grupos as &$grupo) {
                $referencia = $grupo[0];
                if ($referencia['dimensao'] === $medida['dimensao'] && self::equivalente($referencia['valor'], $medida['valor'])) {
                    $grupo[] = $medida;
                    $encaixou = true;
                    break;
                }
            }
            unset($grupo);
            if (! $encaixou) {
                $grupos[] = [$medida];
            }
        }

        return $grupos;
    }

    private static function equivalente(float $esquerda, float $direita): bool
    {
        $tolerancia = max(0.0001, 1e-6 * max(abs($esquerda), abs($direita)));

        return abs($esquerda - $direita) <= $tolerancia;
    }

    private static function padrao(): string
    {
        $unidades = implode('|', array_map(
            fn (string $unidade) => preg_quote($unidade, '/'),
            array_keys(self::UNIDADES)
        ));

        return '/(?<valor>-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?)\s*(?<unidade>'.$unidades.')?\b/iu';
    }

    /** @return array{0: string, 1: float}|null */
    private static function unidade(string $bruta): ?array
    {
        $chave = mb_strtolower(trim($bruta));
        $chave = strtr($chave, ['á' => 'a', 'â' => 'a', 'ã' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ô' => 'o', 'ú' => 'u', 'ç' => 'c']);
        if ($chave === '') {
            return null;
        }

        return self::UNIDADES[$chave] ?? null;
    }

    /**
     * Vírgula é decimal. Ponto seguido de grupos de três dígitos é milhar: 25.500 = 25500.
     */
    private static function numero(string $bruto): ?float
    {
        $bruto = trim($bruto);
        $temVirgula = str_contains($bruto, ',');
        $temPonto = str_contains($bruto, '.');

        if ($temVirgula && $temPonto) {
            if (strrpos($bruto, ',') > strrpos($bruto, '.')) {
                $bruto = str_replace('.', '', $bruto);
                $bruto = str_replace(',', '.', $bruto);
            } else {
                $bruto = str_replace(',', '', $bruto);
            }
        } elseif ($temVirgula) {
            $bruto = str_replace(',', '.', $bruto);
        } elseif ($temPonto && preg_match('/^-?\d{1,3}(?:\.\d{3})+$/', $bruto) === 1) {
            $bruto = str_replace('.', '', $bruto);
        }

        return is_numeric($bruto) ? (float) $bruto : null;
    }
}
