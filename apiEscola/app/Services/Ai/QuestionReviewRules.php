<?php

namespace App\Services\Ai;

use App\Support\PortugueseStress;
use App\Support\QuestionRichText;

/**
 * Regras locais da revisão. Falha aqui reprova a questão sem chamar outro modelo.
 */
class QuestionReviewRules
{
    /**
     * @param  array<string, mixed>  $question
     * @return array<int, array{tipo: string, gravidade: string, descricao: string}>
     */
    public static function problems(array $question): array
    {
        $text = (string) ($question['question_text'] ?? '');
        $explanation = (string) ($question['explanation'] ?? '');
        $options = array_values(array_filter(
            (array) ($question['options'] ?? []),
            fn ($option) => is_array($option)
        ));
        $problems = [];

        if (trim(QuestionRichText::plain($text)) === '') {
            $problems[] = self::problem('inconsistencia_textual', 'alta', 'O enunciado está vazio.');
        }

        $correct = array_values(array_filter(
            $options,
            fn (array $option) => filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN)
        ));
        if (count($options) >= 2 && count($correct) !== 1) {
            $problems[] = self::problem('gabarito', 'alta', 'A questão precisa ter exatamente uma alternativa correta.');
        }

        $guard = QuestionGabaritoGuard::problem($text, $explanation, $options);
        if ($guard !== null) {
            $problems[] = self::problem(
                str_starts_with($guard, 'Tonicidade:') ? 'erro_conceitual' : 'inconsistencia_textual',
                'alta',
                $guard
            );
        }

        $problems = array_merge(
            $problems,
            self::ambiguousOptions($options),
            self::citedWords($text, $options),
            self::arithmetic($text, $options),
            ValidacaoMatematicaService::problemas($options),
        );

        if (count($options) >= 2 && trim(QuestionRichText::plain($explanation)) === '') {
            $problems[] = self::problem('justificativa', 'media', 'A questão objetiva está sem justificativa.');
        }

        $letter = self::correctLetter($options);
        if ($letter !== null && self::claimsAnotherLetter($explanation, $letter)) {
            $problems[] = self::problem(
                'inconsistencia_textual',
                'alta',
                "A justificativa aponta outra letra, mas o gabarito marcado é {$letter}."
            );
        }

        return $problems;
    }

    public static function hasHighSeverity(array $problems): bool
    {
        foreach ($problems as $problem) {
            if (($problem['gravidade'] ?? '') === 'alta') {
                return true;
            }
        }

        return false;
    }

    /** @param  array<int, mixed>  $options */
    public static function correctLetter(array $options): ?string
    {
        foreach (array_values($options) as $index => $option) {
            if (! is_array($option) || $index > 25) {
                continue;
            }
            if (filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                return chr(65 + $index);
            }
        }

        return null;
    }

    /** @param  array<string, mixed>  $question */
    public static function hash(array $question): string
    {
        $lines = [self::norm((string) ($question['question_text'] ?? '')), self::norm((string) ($question['explanation'] ?? ''))];
        foreach ((array) ($question['options'] ?? []) as $option) {
            if (! is_array($option)) {
                continue;
            }
            $flag = filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN) ? '1' : '0';
            $lines[] = $flag.'|'.self::norm((string) ($option['option_text'] ?? $option['text'] ?? ''));
        }

        return hash('sha256', implode("\n", $lines));
    }

    /**
     * @param  array<int, array<string, mixed>>  $options
     * @return array<int, array{tipo: string, gravidade: string, descricao: string}>
     */
    private static function ambiguousOptions(array $options): array
    {
        $problems = [];
        $seen = [];
        foreach ($options as $option) {
            $plain = self::norm((string) ($option['option_text'] ?? $option['text'] ?? ''));
            if ($plain === '') {
                continue;
            }
            if (isset($seen[$plain])) {
                $problems[] = self::problem('ambiguidade', 'alta', 'Há alternativas com o mesmo texto.');

                return $problems;
            }
            $seen[$plain] = true;
        }

        $texts = array_keys($seen);
        $count = count($texts);
        for ($i = 0; $i < $count; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                if (mb_strlen($texts[$i]) < 12 || mb_strlen($texts[$j]) < 12) {
                    continue;
                }
                similar_text($texts[$i], $texts[$j], $percent);
                if ($percent >= 92) {
                    $problems[] = self::problem('ambiguidade', 'alta', 'Duas alternativas são quase iguais e não se distinguem.');

                    return $problems;
                }
            }
        }

        return $problems;
    }

    /**
     * @param  array<int, array<string, mixed>>  $options
     * @return array<int, array{tipo: string, gravidade: string, descricao: string}>
     */
    private static function citedWords(string $question, array $options): array
    {
        $plain = QuestionRichText::plain($question);
        $folded = self::fold($plain);
        if (! preg_match('/(?:aparec|presente|retirad|consta|encontr).{0,40}(?:no texto|do texto)/u', $folded)) {
            return [];
        }
        $at = mb_stripos($plain, 'assinale');
        $support = self::fold($at > 0 ? mb_substr($plain, 0, $at) : $plain);
        $correct = null;
        foreach ($options as $option) {
            if (filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                $correct = (string) ($option['option_text'] ?? $option['text'] ?? '');
                break;
            }
        }
        if ($correct === null || $support === '') {
            return [];
        }

        $problems = [];
        foreach (self::contentWords($correct) as $word) {
            if (PortugueseStress::classify($word) === null) {
                continue;
            }
            if (! str_contains($support, self::fold($word))) {
                $problems[] = self::problem('inconsistencia_textual', 'alta', "A palavra {$word} não aparece no texto.");
            }
        }

        return $problems;
    }

    /**
     * @param  array<int, array<string, mixed>>  $options
     * @return array<int, array{tipo: string, gravidade: string, descricao: string}>
     */
    private static function arithmetic(string $question, array $options): array
    {
        $plain = QuestionRichText::plain($question);
        if (! preg_match('/quanto\s+[eé]\s+(-?\d+(?:[.,]\d+)?)\s*([+\-*x×÷\/])\s*(-?\d+(?:[.,]\d+)?)/iu', $plain, $match)) {
            return [];
        }
        $left = self::number($match[1]);
        $right = self::number($match[3]);
        $expected = match ($match[2]) {
            '+' => $left + $right,
            '-' => $left - $right,
            '*', 'x', '×' => $left * $right,
            '/', '÷' => $right == 0.0 ? null : $left / $right,
            default => null,
        };
        if ($expected === null) {
            return [];
        }
        foreach ($options as $option) {
            if (! filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                continue;
            }
            $raw = QuestionRichText::plain((string) ($option['option_text'] ?? $option['text'] ?? ''));
            if (! preg_match('/-?\d+(?:[.,]\d+)?/u', $raw, $found)) {
                return [];
            }
            $marked = self::number($found[0]);
            if (abs($marked - $expected) > 0.001) {
                return [self::problem('erro_conceitual', 'alta', 'O cálculo do gabarito não confere com o enunciado.')];
            }
        }

        return [];
    }

    private static function claimsAnotherLetter(string $explanation, string $letter): bool
    {
        $plain = QuestionRichText::plain($explanation);
        $patterns = [
            '/\b(?:alternativa|resposta|op[cç][aã]o)\s+corret[ao]s?\s+(?:é|e)\s+(?:a\s+)?(?:letra\s+)?([A-E])\b/iu',
            '/\bcorret[ao]\s+(?:é|e)\s+(?:a\s+)?(?:letra\s+)?([A-E])\b/iu',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $plain, $match) && strtoupper($match[1]) !== $letter) {
                return true;
            }
        }

        return false;
    }

    /** @return array<int, string> */
    private static function contentWords(string $text): array
    {
        $text = preg_replace('/\([^)]*\)/u', ' ', QuestionRichText::plain($text)) ?? $text;
        if (! preg_match_all('/\p{L}{3,}/u', $text, $found)) {
            return [];
        }

        return array_values(array_unique($found[0]));
    }

    private static function number(string $value): float
    {
        return (float) str_replace(',', '.', $value);
    }

    private static function problem(string $tipo, string $gravidade, string $descricao): array
    {
        return ['tipo' => $tipo, 'gravidade' => $gravidade, 'descricao' => $descricao];
    }

    private static function norm(string $text): string
    {
        return self::fold(QuestionRichText::plain($text));
    }

    private static function fold(string $value): string
    {
        $value = mb_strtolower($value);
        $value = strtr($value, [
            'á' => 'a', 'à' => 'a', 'ã' => 'a', 'â' => 'a',
            'é' => 'e', 'ê' => 'e', 'í' => 'i',
            'ó' => 'o', 'õ' => 'o', 'ô' => 'o',
            'ú' => 'u', 'ü' => 'u', 'ç' => 'c',
        ]);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }
}
