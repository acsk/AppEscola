<?php

namespace App\Services\Ai;

use App\Support\QuestionRichText;

/**
 * Questão semelhante = mesma habilidade, outro contexto.
 * O texto longo quase igual ao original (ou às alternativas) não passa.
 */
class SimilarQuestionDiversity
{
    public const RULES = <<<'TXT'
DIVERSIDADE (obrigatório):
A referência serve só para identificar a HABILIDADE cobrada (o que o aluno precisa saber fazer), a disciplina, o assunto, a dificuldade e o formato. O contexto da questão nova tem de ser outro.
Proibido:
- repetir a mesma situação, os mesmos personagens, o mesmo texto de apoio ou a mesma história com palavras trocadas;
- reutilizar números, nomes, datas ou listas de exemplos da referência;
- reaproveitar o texto de qualquer alternativa, inclusive a correta;
- entregar uma paráfrase (a mesma frase em outra ordem ou só com sinônimos).
Se houver mais de uma questão, cada uma usa um contexto diferente das outras e da referência.
Exemplo ruim: a referência lista "fácil, lápis, mesa" e a nova lista "fácil, lápis, casa".
Exemplo bom: a referência cobra identificar paroxítonas nessa lista; a nova cobra a mesma habilidade com outras palavras e outro enunciado (um recado, um cardápio, um diálogo), sem nenhuma palavra da referência.
TXT;

    /**
     * @param  array<int, mixed>  $options
     * @param  array<int, string>  $sourceOptions
     * @param  array<int, string>  $siblingQuestions  enunciados já aceitos neste lote
     */
    public static function tooClose(
        string $question,
        array $options,
        string $sourceQuestion,
        array $sourceOptions,
        array $siblingQuestions = [],
    ): bool {
        $stem = self::norm($question);
        $sourceStem = self::norm($sourceQuestion);
        if (self::stemsTooClose($stem, $sourceStem)) {
            return true;
        }
        foreach ($siblingQuestions as $sibling) {
            if (self::stemsTooClose($stem, self::norm($sibling))) {
                return true;
            }
        }

        return self::optionsTooClose($options, $sourceOptions);
    }

    private static function stemsTooClose(string $stem, string $other): bool
    {
        if (mb_strlen($stem) < 80 || mb_strlen($other) < 80) {
            return false;
        }
        similar_text($stem, $other, $percent);

        return $percent >= 82.0;
    }

    /**
     * @param  array<int, mixed>  $options
     * @param  array<int, string>  $sourceOptions
     */
    private static function optionsTooClose(array $options, array $sourceOptions): bool
    {
        $fresh = [];
        foreach ($options as $option) {
            $text = is_array($option) ? (string) ($option['option_text'] ?? $option['text'] ?? '') : (string) $option;
            $norm = self::norm($text);
            if (mb_strlen($norm) >= 12) {
                $fresh[] = $norm;
            }
        }
        $old = [];
        foreach ($sourceOptions as $option) {
            $norm = self::norm($option);
            if (mb_strlen($norm) >= 12) {
                $old[] = $norm;
            }
        }
        if ($fresh === [] || $old === []) {
            return false;
        }

        $close = 0;
        foreach ($fresh as $option) {
            foreach ($old as $source) {
                if ($option === $source) {
                    $close++;
                    break;
                }
                similar_text($option, $source, $percent);
                if ($percent >= 88.0) {
                    $close++;
                    break;
                }
            }
        }

        return $close >= max(2, (int) ceil(count($fresh) * 0.5));
    }

    private static function norm(string $text): string
    {
        $text = mb_strtolower(QuestionRichText::plain($text));
        $text = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $text) ?? $text;
        $text = preg_replace('/\s+/u', ' ', $text) ?? $text;

        return trim($text);
    }
}
