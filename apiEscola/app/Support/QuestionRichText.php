<?php

namespace App\Support;

/**
 * Texto de questão com formatação leve: texto puro + as tags <b>, <i> e <u> (sem atributos).
 * Quebras de linha são "\n". Qualquer outro "<" é texto literal (ex.: "x < 3") — os clientes
 * renderizam com componentes de texto, nunca como HTML, e escapam o resto ao gerar PDF.
 */
class QuestionRichText
{
    private const ALIASES = ['strong' => 'b', 'em' => 'i', 'ins' => 'u', 'b' => 'b', 'i' => 'i', 'u' => 'u'];

    /** Converte variações (<strong>, <em>, atributos, <br>) para o formato canônico. */
    public static function normalize(?string $text): ?string
    {
        if ($text === null) {
            return null;
        }

        $text = preg_replace('/<br\s*\/?>/i', "\n", $text);

        return preg_replace_callback(
            '/<(\/?)(strong|em|ins|b|i|u)(?:\s[^<>]*)?>/i',
            fn (array $m) => '<'.$m[1].self::ALIASES[strtolower($m[2])].'>',
            $text
        );
    }

    /** Remove as marcações (ex.: busca, prompts de IA, validação de "enunciado vazio"). */
    public static function plain(?string $text): string
    {
        return (string) preg_replace('/<\/?[biu]>/i', '', (string) $text);
    }
}
