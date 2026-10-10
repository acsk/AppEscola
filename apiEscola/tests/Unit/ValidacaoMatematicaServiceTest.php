<?php

namespace Tests\Unit;

use App\Services\Ai\QuestionReviewRules;
use App\Services\Ai\ValidacaoMatematicaService;
use PHPUnit\Framework\TestCase;

class ValidacaoMatematicaServiceTest extends TestCase
{
    public function test_medidas_com_notacao_diferente_sao_a_mesma_grandeza(): void
    {
        $opcoes = [
            ['option_text' => '25,50 km', 'is_correct' => true],
            ['option_text' => '25,500 m', 'is_correct' => false],
            ['option_text' => '25500 m', 'is_correct' => false],
            ['option_text' => '25,500 km', 'is_correct' => false],
        ];

        $problemas = ValidacaoMatematicaService::problemas($opcoes);

        $this->assertCount(1, $problemas);
        $this->assertSame('ambiguidade', $problemas[0]['tipo']);
        $this->assertSame('alta', $problemas[0]['gravidade']);
        $this->assertStringContainsString('A, C, D', $problemas[0]['descricao']);
        $this->assertStringNotContainsString('B', $problemas[0]['descricao']);

        $revisao = QuestionReviewRules::problems([
            'question_text' => 'Qual é a distância percorrida?',
            'explanation' => 'A distância é 25,5 km.',
            'options' => $opcoes,
        ]);
        $this->assertTrue(QuestionReviewRules::hasHighSeverity($revisao));
    }

    public function test_exemplo_de_equivalencia_do_enunciado(): void
    {
        $km = ValidacaoMatematicaService::quantidade('25,5 km');
        $metros = ValidacaoMatematicaService::quantidade('25.500 metros');
        $kmLongo = ValidacaoMatematicaService::quantidade('25,500 km');

        $this->assertNotNull($km);
        $this->assertNotNull($metros);
        $this->assertNotNull($kmLongo);
        $this->assertEqualsWithDelta(25500, $km['valor'], 0.001);
        $this->assertEqualsWithDelta(25500, $metros['valor'], 0.001);
        $this->assertEqualsWithDelta(25500, $kmLongo['valor'], 0.001);
    }

    public function test_alternativa_sem_medida_nao_gera_problema(): void
    {
        $this->assertNull(ValidacaoMatematicaService::quantidade('o narrador se arrepende'));
        $this->assertSame([], ValidacaoMatematicaService::problemas([
            ['option_text' => 'o narrador se arrepende', 'is_correct' => true],
            ['option_text' => 'o narrador se alegra', 'is_correct' => false],
        ]));
    }

    public function test_valores_distintos_na_mesma_unidade_passam(): void
    {
        $this->assertSame([], ValidacaoMatematicaService::problemas([
            ['option_text' => '2 m', 'is_correct' => true],
            ['option_text' => '3 m', 'is_correct' => false],
            ['option_text' => '4 m', 'is_correct' => false],
        ]));

        $iguais = ValidacaoMatematicaService::problemas([
            ['option_text' => '2 m', 'is_correct' => true],
            ['option_text' => '3 m', 'is_correct' => false],
            ['option_text' => '200 cm', 'is_correct' => false],
        ]);
        $this->assertStringContainsString('A, C', $iguais[0]['descricao']);
    }
}
