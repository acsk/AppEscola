<?php

namespace Tests\Unit;

use App\Services\Ai\QuestionGabaritoGuard;
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
}
