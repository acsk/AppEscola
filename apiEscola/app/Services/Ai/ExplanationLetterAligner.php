<?php

namespace App\Services\Ai;

use App\Support\QuestionRichText;

/**
 * A explicação cita letras (A, B, C) na ordem em que a IA listou as alternativas.
 * Se essa ordem muda, ou se a letra não bate com o texto citado, a letra é corrigida.
 */
class ExplanationLetterAligner
{
    /**
     * @param  array<string, string>  $oldToNew  letra original => letra depois de embaralhar
     */
    public static function remap(string $explanation, array $oldToNew): string
    {
        if ($explanation === '' || $oldToNew === []) {
            return $explanation;
        }
        $map = [];
        foreach ($oldToNew as $from => $to) {
            $map[strtoupper((string) $from)] = strtoupper((string) $to);
        }

        $pending = [];
        $n = 0;
        $tokenFor = function (string $letter) use (&$pending, &$n, $map): string {
            $token = "\u{E000}".$n."\u{E001}";
            $n++;
            $pending[$token] = $map[strtoupper($letter)] ?? strtoupper($letter);

            return $token;
        };

        $tag = '(?:</?[biu]>\s*)*';
        $explanation = preg_replace_callback(
            '#(\b(?:alternativa|letra|op[cç][aã]o|item)\s+'.$tag.')([A-Ea-e])(?!\p{L})#iu',
            fn (array $m) => $m[1].$tokenFor($m[2]),
            $explanation
        ) ?? $explanation;

        $explanation = preg_replace_callback(
            '#(?<![\p{L}\p{N}])((?:</?[biu]>\s*)*)([A-Ea-e])((?:\s*</?[biu]>\s*)*)(\s*[).:\-–])#u',
            fn (array $m) => $m[1].$tokenFor($m[2]).$m[3].$m[4],
            $explanation
        ) ?? $explanation;

        return strtr($explanation, $pending);
    }

    /**
     * @param  array<int, mixed>  $options  na ordem exibida, com option_text ou text e is_correct
     */
    public static function align(string $explanation, array $options): string
    {
        $rows = self::rows($options);
        if ($explanation === '' || $rows === []) {
            return $explanation;
        }

        $explanation = self::alignAdjacent($explanation, $rows);

        return self::alignCorrectClaim($explanation, $rows);
    }

    /**
     * @param  array<int, mixed>  $options
     * @return array<int, array{letter: string, plain: string, correct: bool}>
     */
    private static function rows(array $options): array
    {
        $rows = [];
        foreach (array_values($options) as $i => $option) {
            if ($i > 25 || ! is_array($option)) {
                continue;
            }
            $text = (string) ($option['option_text'] ?? $option['text'] ?? '');
            $plain = trim(preg_replace('/\s+/u', ' ', QuestionRichText::plain($text)) ?? '');
            if ($plain === '') {
                continue;
            }
            $rows[] = [
                'letter' => chr(65 + $i),
                'plain' => $plain,
                'correct' => filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN),
            ];
        }

        return $rows;
    }

    /**
     * @param  array<int, array{letter: string, plain: string, correct: bool}>  $rows
     */
    private static function alignAdjacent(string $explanation, array $rows): string
    {
        usort($rows, fn (array $a, array $b) => mb_strlen($b['plain']) <=> mb_strlen($a['plain']));
        foreach ($rows as $row) {
            $quoted = preg_quote($row['plain'], '/');
            $pattern = '/(?<![\p{L}\p{N}])([A-Ea-e])([\s).:\-–,;(]{1,8})('.$quoted.')(?![\p{L}\p{N}])/iu';
            $explanation = preg_replace_callback($pattern, function (array $m) use ($row) {
                $punctuation = preg_match('/[).:\-–,;(]/u', $m[2]) === 1;
                if (! $punctuation && $m[1] !== strtoupper($m[1])) {
                    return $m[0];
                }
                if (strtoupper($m[1]) === $row['letter']) {
                    return $m[0];
                }

                return $row['letter'].$m[2].$m[3];
            }, $explanation) ?? $explanation;
        }

        return $explanation;
    }

    /**
     * @param  array<int, array{letter: string, plain: string, correct: bool}>  $rows
     */
    private static function alignCorrectClaim(string $explanation, array $rows): string
    {
        $correct = null;
        foreach ($rows as $row) {
            if ($row['correct']) {
                $correct = $row['letter'];
                break;
            }
        }
        if ($correct === null) {
            return $explanation;
        }

        $patterns = [
            '/(\b(?:alternativa|resposta|op[cç][aã]o)\s+corret[ao]s?\s+(?:é|e)\s+(?:a\s+)?(?:letra\s+)?)([A-Ea-e])(?!\p{L})/iu',
            '/(\b(?:gabarito|resposta)\s+(?:é|e|:)\s*(?:a\s+)?(?:letra\s+)?)([A-Ea-e])(?!\p{L})/iu',
            '/(\bcorret[ao]\s+(?:é|e)\s+(?:a\s+)?(?:letra\s+)?)([A-Ea-e])(?!\p{L})/iu',
            '/(\balternativa\s+)([A-Ea-e])(\s+(?:está|esta)\s+corret)/iu',
        ];
        foreach ($patterns as $pattern) {
            $explanation = preg_replace_callback($pattern, function (array $m) use ($correct) {
                if (strtoupper($m[2]) === $correct) {
                    return $m[0];
                }
                $updated = $m[1].$correct;

                return isset($m[3]) ? $updated.$m[3] : $updated;
            }, $explanation) ?? $explanation;
        }

        return $explanation;
    }
}
