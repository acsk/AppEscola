<?php

namespace App\Support;

/**
 * Ano da prova citado na própria questão: cabeçalho do enunciado ("(ENEM 2019)", "UFRGS/2018 –")
 * ou nome da prova de origem ("ENEM 2023 - 1º dia"). Anos soltos no meio do texto ("Em 1945, ...") não contam.
 */
final class QuestionYear
{
    /** Só o começo do enunciado: é onde fica o cabeçalho com banca e ano. */
    private const HEADER_CHARS = 160;

    private const CITATION_WORDS = '/adaptad|dispon[ií]vel|acesso|fonte|lei\b|decreto|art\.|p\.\s*\d/iu';

    public static function fromHeader(?string $statement): ?int
    {
        $plain = trim(QuestionRichText::plain((string) $statement));
        if ($plain === '') {
            return null;
        }
        $head = mb_substr($plain, 0, self::HEADER_CHARS);

        if (preg_match_all('/[(\[]\s*(\p{L}[^()\[\]\n]{0,40}?)\b((?:19|20)\d{2})\b[^()\[\]\n]{0,25}[)\]]/u', $head, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                if (! preg_match(self::CITATION_WORDS, $match[0])) {
                    return self::valid((int) $match[2]);
                }
            }
        }

        // Sem parênteses, só sigla em maiúsculas logo no início: "ENEM 2019 – ...", "1. FUVEST-SP/2017".
        if (preg_match('/^\s*(?:\d{1,3}\s*[.)\-–]\s*)?(?:QUEST[ÃA]O\s*\d+\s*[.)\-–:]?\s*)?\p{Lu}[\p{Lu}\d\-\/ ]{1,30}?[\s\/\-–]+((?:19|20)\d{2})\b/u', $head, $match)) {
            return self::valid((int) $match[1]);
        }

        return null;
    }

    public static function fromExamName(?string $name): ?int
    {
        return preg_match('/\b((?:19|20)\d{2})\b/u', (string) $name, $match) ? self::valid((int) $match[1]) : null;
    }

    /** Primeiro ano encontrado: cabeçalho dos enunciados, depois os nomes de prova. */
    public static function detect(array $statements, array $examNames = []): ?int
    {
        foreach ($statements as $statement) {
            if (($year = self::fromHeader($statement)) !== null) {
                return $year;
            }
        }
        foreach ($examNames as $name) {
            if (($year = self::fromExamName($name)) !== null) {
                return $year;
            }
        }

        return null;
    }

    private static function valid(int $year): ?int
    {
        return $year >= 1900 && $year <= (int) date('Y') + 1 ? $year : null;
    }
}
