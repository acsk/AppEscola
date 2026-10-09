<?php

namespace Tests\Unit;

use App\Services\Ai\QuestionGabaritoGuard;
use App\Support\PortugueseStress;
use PHPUnit\Framework\TestCase;

class QuestionGabaritoGuardTest extends TestCase
{
    public function test_detects_explanation_that_admits_no_option_is_correct(): void
    {
        $explanation = <<<'TXT'
Nenhuma das alternativas está correta. A questão apresenta erro.
- A) coração, televisão, computador — todas oxítonas.
- B) cárcere (proparoxítona), máquina (proparoxítona), lápis (paroxítona).
- C) árvore (proparoxítona), mesa (paroxítona), casa (paroxítona).
- D) caminhão, computador, sofá — todas oxítonas.
Conclusão: nenhuma opção apresenta apenas palavras paroxítonas.
Exemplo de alternativa correta: fácil, lápis, mesa.
Dica: paroxítonas são palavras cuja penúltima sílaba é a tônica.
TXT;

        $this->assertTrue(QuestionGabaritoGuard::admitsBrokenQuestion($explanation));
    }

    public function test_accepts_explanation_that_justifies_the_marked_option(): void
    {
        $explanation = 'Fácil (fá-cil), lápis (lá-pis) e mesa (me-sa) têm a penúltima sílaba tônica, então são paroxítonas. '
            .'As demais alternativas misturam oxítonas ou proparoxítonas.';

        $this->assertFalse(QuestionGabaritoGuard::admitsBrokenQuestion($explanation));
    }

    public function test_stress_classes_match_school_rules(): void
    {
        $cases = [
            'fácil' => 'paroxitona',
            'lápis' => 'paroxitona',
            'mesa' => 'paroxitona',
            'casa' => 'paroxitona',
            'caminho' => 'paroxitona',
            'telefone' => 'paroxitona',
            'árvore' => 'proparoxitona',
            'máquina' => 'proparoxitona',
            'cárcere' => 'proparoxitona',
            'café' => 'oxitona',
            'sofá' => 'oxitona',
            'avó' => 'oxitona',
            'abacaxi' => 'oxitona',
            'futebol' => 'oxitona',
            'computador' => 'oxitona',
            'televisão' => 'oxitona',
            'coração' => 'oxitona',
        ];

        foreach ($cases as $word => $expected) {
            $this->assertSame($expected, PortugueseStress::classify($word), $word.' '.implode('-', PortugueseStress::syllables($word)));
        }
    }

    public function test_rejects_paroxytone_option_that_includes_arvore(): void
    {
        $question = 'Assinale a alternativa em que todas as palavras são paroxítonas.';
        $explanation = 'Portanto, a alternativa correta é a 1, pois todas as palavras são paroxítonas. '
            .'"árvore" (ár-vo-re) são paroxítonas. "café" é paroxítona, mas "sofá" e "avó" são oxítonas. '
            .'"abacaxi" é proparoxítona. "computador" é paroxítona.';
        $options = [
            ['option_text' => 'fácil, lápis, árvore', 'is_correct' => true],
            ['option_text' => 'café, sofá, avó', 'is_correct' => false],
            ['option_text' => 'caminho, abacaxi, telefone', 'is_correct' => false],
            ['option_text' => 'futebol, computador, televisão', 'is_correct' => false],
        ];

        $problem = QuestionGabaritoGuard::problem($question, $explanation, $options);

        $this->assertNotNull($problem);
        $this->assertStringContainsString('Tonicidade:', $problem);
        $this->assertStringContainsString('árvore: proparoxítona', $problem);
        $this->assertStringContainsString('Nenhuma alternativa contém somente paroxítonas', $problem);
    }

    public function test_accepts_option_that_really_is_all_paroxytones(): void
    {
        $question = 'Assinale a alternativa em que todas as palavras são paroxítonas.';
        $explanation = 'Fácil, lápis e mesa têm a penúltima sílaba tônica, então todas são paroxítonas.';
        $options = [
            ['option_text' => 'fácil, lápis, mesa', 'is_correct' => true],
            ['option_text' => 'café, sofá, avó', 'is_correct' => false],
            ['option_text' => 'árvore, máquina, cárcere', 'is_correct' => false],
        ];

        $this->assertNull(QuestionGabaritoGuard::problem($question, $explanation, $options));
    }
}
