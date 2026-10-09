<?php

namespace App\Support;

/**
 * Tonicidade pela ortografia (acento gráfico e terminação), não por “achismo” do modelo.
 * Proparoxítona = antepenúltima; paroxítona = penúltima; oxítona = última.
 */
class PortugueseStress
{
    private const STRESS_MARKS = ['á', 'à', 'â', 'é', 'ê', 'í', 'ó', 'ô', 'ú'];

    private const CLUSTERS = ['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tl', 'tr', 'vr'];

    private const DIGRAPHS = ['ch', 'lh', 'nh', 'qu', 'gu'];

    /** @return 'oxitona'|'paroxitona'|'proparoxitona'|null */
    public static function classify(string $word): ?string
    {
        $syllables = self::syllables($word);
        if ($syllables === [] || count($syllables) === 0) {
            return null;
        }

        $tonic = self::tonicIndex($syllables);
        $fromEnd = count($syllables) - $tonic;

        return match (true) {
            $fromEnd <= 1 => 'oxitona',
            $fromEnd === 2 => 'paroxitona',
            default => 'proparoxitona',
        };
    }

    public static function label(?string $class): string
    {
        return match ($class) {
            'oxitona' => 'oxítona',
            'paroxitona' => 'paroxítona',
            'proparoxitona' => 'proparoxítona',
            default => 'indeterminada',
        };
    }

    /** Ex.: "árvore: proparoxítona (ár-vo-re)". */
    public static function describe(string $word): ?string
    {
        $clean = self::normalize($word);
        if ($clean === null) {
            return null;
        }
        $class = self::classify($clean);
        $syllables = self::syllables($clean);
        if ($class === null || $syllables === []) {
            return null;
        }

        return $clean.': '.self::label($class).' ('.implode('-', $syllables).')';
    }

    /** @return array<int, string> */
    public static function syllables(string $word): array
    {
        $word = self::normalize($word);
        if ($word === null) {
            return [];
        }

        $chars = mb_str_split($word);
        $vowelAt = [];
        $count = count($chars);
        for ($i = 0; $i < $count; $i++) {
            if (! self::isVowel($chars[$i])) {
                continue;
            }
            if (self::isSilentU($chars, $i)) {
                continue;
            }
            $vowelAt[] = $i;
        }
        if ($vowelAt === []) {
            return [$word];
        }

        $nuclei = [];
        $n = count($vowelAt);
        for ($i = 0; $i < $n; $i++) {
            $start = $vowelAt[$i];
            $end = $start;
            if ($i + 1 < $n && $vowelAt[$i + 1] === $start + 1 && self::isDiphthong($chars[$start], $chars[$start + 1])) {
                $end = $vowelAt[$i + 1];
                $i++;
            }
            $nuclei[] = [$start, $end];
        }

        $syllables = [];
        $cursor = 0;
        $last = count($nuclei) - 1;
        foreach ($nuclei as $index => [$start, $end]) {
            $next = $nuclei[$index + 1][0] ?? $count;
            $between = implode('', array_slice($chars, $end + 1, max(0, $next - $end - 1)));
            [$keep, $send] = $index === $last ? [$between, ''] : self::splitConsonants($between);
            $syllables[] = implode('', array_slice($chars, $cursor, $end - $cursor + 1)).$keep;
            $cursor = $end + 1 + mb_strlen($keep);
            if ($send !== '' && $index === $last) {
                $syllables[$last] .= $send;
            }
        }

        return array_values(array_filter($syllables, fn ($syllable) => $syllable !== ''));
    }

    /** @param  array<int, string>  $syllables */
    private static function tonicIndex(array $syllables): int
    {
        foreach ($syllables as $index => $syllable) {
            if (self::hasStressMark($syllable)) {
                return $index;
            }
        }

        $last = $syllables[count($syllables) - 1];
        if (self::endingIsOxytone($last)) {
            return count($syllables) - 1;
        }

        return max(0, count($syllables) - 2);
    }

    private static function endingIsOxytone(string $syllable): bool
    {
        $syllable = mb_strtolower($syllable);
        if (str_ends_with($syllable, 's') && mb_strlen($syllable) > 2 && ! str_ends_with($syllable, 'ss')) {
            $syllable = mb_substr($syllable, 0, -1);
        }
        foreach (['ão', 'ãe', 'õe', 'im', 'um', 'ã'] as $ending) {
            if (str_ends_with($syllable, $ending)) {
                return true;
            }
        }

        return in_array(mb_substr($syllable, -1), ['r', 'l', 'z', 'x', 'i', 'u'], true);
    }

    private static function hasStressMark(string $text): bool
    {
        foreach (self::STRESS_MARKS as $mark) {
            if (mb_strpos($text, $mark) !== false) {
                return true;
            }
        }

        return false;
    }

    /** @param  array<int, string>  $chars */
    private static function isSilentU(array $chars, int $index): bool
    {
        if (($chars[$index] ?? '') !== 'u' || $index === 0) {
            return false;
        }
        $prev = $chars[$index - 1] ?? '';
        $next = self::base($chars[$index + 1] ?? '');

        return in_array($prev, ['q', 'g'], true) && in_array($next, ['e', 'i'], true);
    }

    private static function isDiphthong(string $a, string $b): bool
    {
        if (self::hasStressMark($b)) {
            return false;
        }
        $baseA = self::base($a);
        $baseB = self::base($b);
        $strong = ['a', 'e', 'o'];
        $weak = ['i', 'u'];
        if (in_array($baseA, $strong, true) && in_array($baseB, $weak, true)) {
            return true;
        }
        if (in_array($a, ['ã', 'õ'], true) && in_array($baseB, ['o', 'e'], true)) {
            return true;
        }
        if (in_array($baseA, $weak, true) && in_array($baseB, $strong, true) && ! self::hasStressMark($a)) {
            return true;
        }

        return in_array($baseA, $weak, true) && in_array($baseB, $weak, true) && $baseA !== $baseB;
    }

    /** @return array{0: string, 1: string} trecho que fica na sílaba atual e trecho que vai para a próxima */
    private static function splitConsonants(string $consonants): array
    {
        if ($consonants === '') {
            return ['', ''];
        }
        $pieces = self::pieces($consonants);
        $total = count($pieces);
        if ($total <= 1) {
            return ['', implode('', $pieces)];
        }
        $pair = $pieces[$total - 2].$pieces[$total - 1];
        if (in_array($pair, self::CLUSTERS, true)) {
            $stay = implode('', array_slice($pieces, 0, $total - 2));

            return [$stay, $pieces[$total - 2].$pieces[$total - 1]];
        }

        return [implode('', array_slice($pieces, 0, $total - 1)), $pieces[$total - 1]];
    }

    /** @return array<int, string> */
    private static function pieces(string $consonants): array
    {
        $chars = mb_str_split($consonants);
        $pieces = [];
        $count = count($chars);
        for ($i = 0; $i < $count; $i++) {
            $pair = $chars[$i].($chars[$i + 1] ?? '');
            if (in_array($pair, self::DIGRAPHS, true)) {
                $pieces[] = $pair;
                $i++;
                continue;
            }
            $pieces[] = $chars[$i];
        }

        return $pieces;
    }

    private static function isVowel(string $char): bool
    {
        return in_array(self::base($char), ['a', 'e', 'i', 'o', 'u'], true);
    }

    private static function base(string $char): string
    {
        return strtr(mb_strtolower($char), [
            'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a',
            'é' => 'e', 'ê' => 'e',
            'í' => 'i',
            'ó' => 'o', 'ô' => 'o', 'õ' => 'o',
            'ú' => 'u', 'ü' => 'u',
        ]);
    }

    private static function normalize(string $word): ?string
    {
        $word = mb_strtolower(trim($word));
        $word = preg_replace('/[^\p{L}]/u', '', $word) ?? '';
        if ($word === '' || mb_strlen($word) < 2) {
            return null;
        }

        return $word;
    }
}
