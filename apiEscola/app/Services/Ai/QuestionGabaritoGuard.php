<?php

namespace App\Services\Ai;

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
