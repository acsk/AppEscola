<?php

namespace App\Services\Ai;

use App\Support\PortugueseStress;
use App\Support\QuestionRichText;

/**
 * Impede questão cuja própria resolução conclui que o item está errado
 * (nenhuma alternativa correta, exemplo de resposta fora das opções).
 */
class QuestionGabaritoGuard
{
    public const AUTHORING_RULE = 'Confira o gabarito antes de responder: resolva o enunciado e só então marque a única alternativa que satisfaz o comando. '
        .'Se a resolução mostrar que nenhuma alternativa está correta, reescreva as alternativas (uma correta, já conferida, e as demais erradas) em vez de descrever o erro. '
        .'A explicação justifica somente a alternativa marcada. É proibido escrever que nenhuma alternativa está correta, que a questão apresenta erro, ou dar um exemplo de resposta que não está entre as opções. '
        .'Em classificação de palavras (oxítona, paroxítona, proparoxítona, ortografia), separe a sílaba tônica de cada palavra da alternativa marcada e confirme que todas cumprem o critério do enunciado.';

    public static function admitsBrokenQuestion(string $explanation): bool
    {
        $text = self::fold(QuestionRichText::plain($explanation));
        if ($text === '') {
            return false;
        }

        foreach ([
            'nenhuma das alternativas esta correta',
            'nenhuma das alternativas e correta',
            'nenhuma alternativa esta correta',
            'nenhuma alternativa e correta',
            'nenhuma opcao esta correta',
            'nenhuma opcao e correta',
            'nenhuma opcao apresenta',
            'nenhuma das opcoes esta correta',
            'nenhuma das opcoes apresenta',
            'nao ha alternativa correta',
            'nao existe alternativa correta',
            'a questao apresenta erro',
            'a questao esta errada',
            'questao apresenta erro',
            'exemplo de alternativa correta',
            'gabarito inexistente',
            'a questao deve ser anulada',
            'questao deve ser anulada',
        ] as $needle) {
            if (str_contains($text, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Motivo para recusar a questão, ou null se o gabarito pode seguir.
     *
     * @param  array<int, mixed>  $options
     */
    public static function problem(string $questionText, string $explanation, array $options): ?string
    {
        if (self::admitsBrokenQuestion($explanation)) {
            return 'A explicação admite que nenhuma alternativa está correta.';
        }

        return self::stressMismatch($questionText, $explanation, $options);
    }

    /**
     * Fatos de tonicidade das palavras que aparecem nas alternativas.
     *
     * @param  array<int, mixed>  $options
     */
    public static function stressFacts(array $options): string
    {
        $lines = [];
        foreach (self::optionRows($options) as $row) {
            foreach (self::words($row['text']) as $word) {
                $described = PortugueseStress::describe($word);
                if ($described !== null) {
                    $lines[$described] = $described;
                }
            }
        }

        return $lines === [] ? '' : implode("\n", $lines);
    }

    /**
     * @param  array<int, mixed>  $options
     */
    public static function stressMismatch(string $questionText, string $explanation, array $options): ?string
    {
        $target = self::targetStressClass($questionText."\n".$explanation);
        if ($target === null) {
            return null;
        }

        $rows = self::optionRows($options);
        $fitting = [];
        $marked = null;
        $facts = [];
        foreach ($rows as $index => $row) {
            $classes = [];
            foreach (self::words($row['text']) as $word) {
                $class = PortugueseStress::classify($word);
                if ($class === null) {
                    continue;
                }
                $classes[$word] = $class;
                $described = PortugueseStress::describe($word);
                if ($described !== null) {
                    $facts[$word] = $described;
                }
            }
            if ($classes === []) {
                continue;
            }
            $ok = ! in_array(false, array_map(fn (string $class) => $class === $target, $classes), true);
            if ($ok) {
                $fitting[] = $index;
            }
            if ($row['is_correct']) {
                $marked = ['index' => $index, 'ok' => $ok, 'classes' => $classes];
            }
        }

        if ($facts === [] || ($marked !== null && $marked['ok'])) {
            return null;
        }

        $label = PortugueseStress::label($target);
        $lines = array_values($facts);
        if ($marked === null) {
            return null;
        }

        $detail = "Tonicidade: a alternativa marcada não contém só {$label}s.\n".implode("\n", $lines);
        if ($fitting === []) {
            $detail .= "\nNenhuma alternativa contém somente {$label}s. Troque as palavras da alternativa correta.";
        }

        return $detail;
    }

    private static function targetStressClass(string $text): ?string
    {
        $folded = self::fold($text);
        if (! str_contains($folded, 'oxiton') && ! str_contains($folded, 'paroxiton')) {
            return null;
        }

        $pattern = '/(?:todas|somente|apenas|so)\b.{0,50}\b(proparoxitonas?|paroxitonas?|oxitonas?)\b/u';
        if (! preg_match($pattern, $folded, $match)) {
            $pattern = '/alternativa correta\b.{0,80}\b(proparoxitonas?|paroxitonas?|oxitonas?)\b/u';
            if (! preg_match($pattern, $folded, $match)) {
                return null;
            }
        }

        return match (true) {
            str_starts_with($match[1], 'proparox') => 'proparoxitona',
            str_starts_with($match[1], 'parox') => 'paroxitona',
            default => 'oxitona',
        };
    }

    /**
     * @param  array<int, mixed>  $options
     * @return array<int, array{text: string, is_correct: bool}>
     */
    private static function optionRows(array $options): array
    {
        $rows = [];
        foreach ($options as $option) {
            if (! is_array($option)) {
                continue;
            }
            $text = (string) ($option['option_text'] ?? $option['text'] ?? '');
            $rows[] = [
                'text' => $text,
                'is_correct' => filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN),
            ];
        }

        return $rows;
    }

    /** @return array<int, string> */
    private static function words(string $text): array
    {
        $text = preg_replace('/\([^)]*\)/u', ' ', $text) ?? $text;
        $text = preg_replace('/\b(proparoxítonas?|paroxítonas?|oxítonas?|proparoxitonas?|paroxitonas?|oxitonas?|palavras?|todas?|somente|apenas|são|sao)\b/ui', ' ', $text) ?? $text;
        $words = [];
        if (preg_match_all('/\p{L}{2,}/u', $text, $found)) {
            foreach ($found[0] as $word) {
                $words[] = $word;
            }
        }

        return $words;
    }

    private static function fold(string $value): string
    {
        $value = mb_strtolower($value);
        $value = strtr($value, [
            'á' => 'a', 'à' => 'a', 'ã' => 'a', 'â' => 'a',
            'é' => 'e', 'ê' => 'e',
            'í' => 'i',
            'ó' => 'o', 'õ' => 'o', 'ô' => 'o',
            'ú' => 'u', 'ü' => 'u',
            'ç' => 'c',
        ]);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }
}
