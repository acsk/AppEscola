<?php

namespace App\Services\Ai;

/**
 * A revisão escolhe a alternativa correta e reescreve a explicação.
 * A letra gravada é sempre a da alternativa que fica marcada.
 */
class ReviewAnswerApplier
{
    /**
     * @param  array<string, mixed>  $question
     * @param  array<string, mixed>|null  $reviewer
     * @return array{question: array<string, mixed>, gabarito: ?string, changed: bool}
     */
    public static function apply(array $question, ?array $reviewer): array
    {
        $current = self::normalize((array) ($question['options'] ?? []));
        $options = $current;
        $letter = is_array($reviewer) ? self::letter($reviewer['gabarito_revisor'] ?? null) : null;

        if (is_array($reviewer)) {
            $parsed = self::parse($reviewer['opcoes'] ?? $reviewer['options'] ?? null);
            if ($parsed !== null) {
                $options = self::mark($parsed['options'], $parsed['flagged'], $letter);
            } elseif ($letter !== null) {
                $options = self::mark($current, null, $letter);
            }
        }

        $originalExplanation = (string) ($question['explanation'] ?? '');
        $explanation = is_array($reviewer) ? trim((string) ($reviewer['justificativa'] ?? '')) : '';
        if ($explanation === '') {
            $explanation = $originalExplanation;
        }
        $explanation = ExplanationLetterAligner::align($explanation, $options);

        $question['options'] = $options;
        $question['explanation'] = $explanation;

        return [
            'question' => $question,
            'gabarito' => QuestionReviewRules::correctLetter($options),
            'changed' => self::signature($current) !== self::signature($options) || $explanation !== $originalExplanation,
        ];
    }

    /**
     * @param  array<int, array{option_text: string, is_correct: bool}>  $options
     * @return array<int, array{option_text: string, is_correct: bool}>
     */
    private static function mark(array $options, ?int $flagged, ?string $letter): array
    {
        $index = $flagged;
        if ($index === null && $letter !== null) {
            $at = ord($letter) - 65;
            if ($at >= 0 && $at < count($options)) {
                $index = $at;
            }
        }
        if ($index === null) {
            foreach ($options as $i => $option) {
                if ($option['is_correct']) {
                    $index = $i;
                    break;
                }
            }
        }
        if ($index === null && $options !== []) {
            $index = 0;
        }
        foreach ($options as $i => $option) {
            $options[$i]['is_correct'] = $i === $index;
        }

        return $options;
    }

    /**
     * @return array{options: array<int, array{option_text: string, is_correct: bool}>, flagged: ?int}|null
     */
    private static function parse(mixed $raw): ?array
    {
        if (! is_array($raw)) {
            return null;
        }
        $options = [];
        $flagged = [];
        foreach (array_values($raw) as $index => $option) {
            if ($index > 9) {
                break;
            }
            $text = is_array($option)
                ? trim((string) ($option['option_text'] ?? $option['text'] ?? ''))
                : trim((string) $option);
            if ($text === '') {
                continue;
            }
            $correct = is_array($option) && filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN);
            if ($correct) {
                $flagged[] = count($options);
            }
            $options[] = ['option_text' => $text, 'is_correct' => $correct];
        }
        if (count($options) < 2) {
            return null;
        }

        return [
            'options' => $options,
            'flagged' => count($flagged) === 1 ? $flagged[0] : null,
        ];
    }

    /**
     * @param  array<int, mixed>  $options
     * @return array<int, array{option_text: string, is_correct: bool}>
     */
    private static function normalize(array $options): array
    {
        $normalized = [];
        foreach (array_values($options) as $index => $option) {
            if ($index > 9 || ! is_array($option)) {
                continue;
            }
            $normalized[] = [
                'option_text' => trim((string) ($option['option_text'] ?? $option['text'] ?? '')),
                'is_correct' => filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN),
            ];
        }

        return $normalized;
    }

    /** @param  array<int, array{option_text: string, is_correct: bool}>  $options */
    private static function signature(array $options): string
    {
        $lines = [];
        foreach ($options as $option) {
            $lines[] = ($option['is_correct'] ? '1' : '0').'|'.mb_strtolower($option['option_text']);
        }

        return implode("\n", $lines);
    }

    private static function letter(mixed $value): ?string
    {
        $letter = strtoupper(trim((string) $value));

        return preg_match('/^[A-E]$/', $letter) === 1 ? $letter : null;
    }
}
