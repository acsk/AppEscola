<?php

namespace Tests\Unit;

use App\Support\QuestionYear;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class QuestionYearTest extends TestCase
{
    public static function headers(): array
    {
        return [
            'banca entre parênteses' => ['(ENEM 2019) Leia o texto a seguir.', 2019],
            'banca com barra' => ['(Enem/2018) Considere a função.', 2018],
            'banca com UF e fase' => ['(UERJ – 2ª fase 2017) Um corpo cai...', 2017],
            'colchetes' => ['[FUVEST-SP 2016] Calcule.', 2016],
            'sigla sem parênteses' => ['UFRGS/2015 – Assinale a alternativa correta.', 2015],
            'número da questão antes' => ['3. ENEM 2014 - Observe o gráfico.', 2014],
            'com formatação' => ['<b>(UNICAMP 2013)</b> Explique.', 2013],
            'ano solto no texto' => ['Em 1945, terminou a Segunda Guerra Mundial. O que mudou?', null],
            'citação de fonte' => ['(Adaptado de SILVA, 2010) Leia o texto.', null],
            'lei com ano' => ['(Lei nº 9.394 de 1996) Sobre a LDB, assinale.', null],
            'ano fora do cabeçalho' => [str_repeat('Texto de apoio longo. ', 12).'(ENEM 2019)', null],
            'ano no futuro' => ['(ENEM 2999) Questão.', null],
            'sem enunciado' => [null, null],
        ];
    }

    #[DataProvider('headers')]
    public function test_year_from_statement_header(?string $statement, ?int $expected): void
    {
        $this->assertSame($expected, QuestionYear::fromHeader($statement));
    }

    public function test_year_from_exam_name_and_precedence(): void
    {
        $this->assertSame(2023, QuestionYear::fromExamName('ENEM 2023 - 1º dia'));
        $this->assertNull(QuestionYear::fromExamName('Simulado de revisão'));
        $this->assertSame(2019, QuestionYear::detect(['(ENEM 2019) Questão'], ['Vestibular 2020']));
        $this->assertSame(2020, QuestionYear::detect(['Questão sem ano'], ['Vestibular 2020']));
        $this->assertNull(QuestionYear::detect(['Questão sem ano'], [null]));
    }
}
