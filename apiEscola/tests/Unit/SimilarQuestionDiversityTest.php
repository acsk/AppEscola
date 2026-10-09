<?php

namespace Tests\Unit;

use App\Services\Ai\SimilarQuestionDiversity;
use PHPUnit\Framework\TestCase;

class SimilarQuestionDiversityTest extends TestCase
{
    public function test_short_variation_of_the_same_skill_is_accepted(): void
    {
        $this->assertFalse(SimilarQuestionDiversity::tooClose(
            'Quanto é 1 + 1?',
            [['option_text' => '2'], ['option_text' => '3']],
            'Quanto é 2 + 2?',
            ['3', '4'],
        ));
    }

    public function test_long_paraphrase_of_the_same_situation_is_rejected(): void
    {
        $source = 'Leia o recado da professora e assinale a alternativa em que todas as palavras são paroxítonas. '
            .'No quadro estavam escritas as palavras fácil, lápis e mesa, e os alunos deveriam reconhecer a sílaba tônica de cada uma.';
        $copy = 'Leia o recado da professora e assinale a alternativa em que todas as palavras são paroxítonas. '
            .'No quadro estavam escritas as palavras fácil, lápis e casa, e os alunos deveriam reconhecer a sílaba tônica de cada uma.';

        $this->assertTrue(SimilarQuestionDiversity::tooClose($copy, [], $source, []));
    }

    public function test_same_skill_in_another_situation_is_accepted(): void
    {
        $source = 'Leia o recado da professora e assinale a alternativa em que todas as palavras são paroxítonas. '
            .'No quadro estavam escritas as palavras fácil, lápis e mesa, e os alunos deveriam reconhecer a sílaba tônica de cada uma.';
        $fresh = 'No cardápio da lanchonete, os itens do dia estão escritos no balcão. Assinale a alternativa em que todas as palavras são oxítonas, '
            .'observando qual sílaba soa mais forte em cada nome de lanche.';

        $this->assertFalse(SimilarQuestionDiversity::tooClose($fresh, [], $source, []));
    }

    public function test_repeated_option_texts_are_rejected(): void
    {
        $sourceOptions = [
            'fácil, lápis e mesa no quadro da sala',
            'café, sofá e avó na sala de estar',
            'árvore, máquina e cárcere no dicionário',
            'abacaxi, computador e televisão ligados',
        ];
        $copy = [
            ['option_text' => 'fácil, lápis e mesa no quadro da sala'],
            ['option_text' => 'café, sofá e avó na sala de estar'],
            ['option_text' => 'um conjunto bem diferente de exemplos novos'],
            ['option_text' => 'outra lista que não aparece na referência'],
        ];

        $this->assertTrue(SimilarQuestionDiversity::tooClose(
            'Enunciado curto e novo.',
            $copy,
            'Outro enunciado curto.',
            $sourceOptions,
        ));
    }

    public function test_questions_in_the_same_batch_cannot_repeat_each_other(): void
    {
        $source = 'Calcule a área de um terreno retangular de 8 m por 12 m e explique o resultado para o proprietário.';
        $first = 'Uma padaria vendeu 36 pães de manhã e 15 à tarde. Quantos pães foram vendidos no dia, e qual foi o total em reais se cada pão custa 2 reais?';
        $second = 'Uma padaria vendeu 36 pães de manhã e 15 à tarde. Quantos pães foram vendidos no dia, e qual foi o total em reais se cada pão custa 3 reais?';

        $this->assertFalse(SimilarQuestionDiversity::tooClose($first, [], $source, []));
        $this->assertTrue(SimilarQuestionDiversity::tooClose($second, [], $source, [], [$first]));
    }
}
