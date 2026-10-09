<?php

namespace Tests\Unit;

use App\Services\Ai\QuestionReviewRules;
use App\Support\PortugueseStress;
use PHPUnit\Framework\TestCase;

class QuestionReviewRulesTest extends TestCase
{
    public function test_monosyllable_is_not_an_oxytone(): void
    {
        $this->assertSame('monossilabo', PortugueseStress::classify('mar'));

        $problems = QuestionReviewRules::problems([
            'question_text' => 'Assinale a alternativa em que todas as palavras são oxítonas.',
            'explanation' => 'Mar é oxítona e está na alternativa correta.',
            'options' => [
                ['option_text' => 'mar, café', 'is_correct' => true],
                ['option_text' => 'sofá, avó', 'is_correct' => false],
            ],
        ]);

        $this->assertTrue(QuestionReviewRules::hasHighSeverity($problems));
        $this->assertStringContainsString('Tonicidade', $problems[0]['descricao']);
    }

    public function test_word_missing_from_the_passage_is_rejected(): void
    {
        $problems = QuestionReviewRules::problems([
            'question_text' => "No porto, o café esfriava.\n\nAssinale a alternativa em que todas as palavras aparecem no texto.",
            'explanation' => 'A alternativa A reúne palavras do texto.',
            'options' => [
                ['option_text' => 'café, mar', 'is_correct' => true],
                ['option_text' => 'porto', 'is_correct' => false],
            ],
        ]);

        $this->assertTrue(collect($problems)->contains(fn (array $problem) => str_contains($problem['descricao'], 'mar não aparece')));
    }

    public function test_wrong_arithmetic_key_is_rejected(): void
    {
        $problems = QuestionReviewRules::problems([
            'question_text' => 'Quanto é 12 + 8?',
            'explanation' => '12 + 8 = 20.',
            'options' => [
                ['option_text' => '19', 'is_correct' => true],
                ['option_text' => '20', 'is_correct' => false],
            ],
        ]);

        $this->assertTrue(collect($problems)->contains(fn (array $problem) => $problem['tipo'] === 'erro_conceitual'));
    }

    public function test_matching_arithmetic_and_single_key_pass(): void
    {
        $problems = QuestionReviewRules::problems([
            'question_text' => 'Quanto é 2 + 2?',
            'explanation' => '2 + 2 = 4. A alternativa correta é a B.',
            'options' => [
                ['option_text' => '3', 'is_correct' => false],
                ['option_text' => '4', 'is_correct' => true],
            ],
        ]);

        $this->assertFalse(QuestionReviewRules::hasHighSeverity($problems));
        $this->assertSame('B', QuestionReviewRules::correctLetter([
            ['option_text' => '3', 'is_correct' => false],
            ['option_text' => '4', 'is_correct' => true],
        ]));
    }

    public function test_duplicate_options_and_wrong_letter_in_the_explanation_are_rejected(): void
    {
        $problems = QuestionReviewRules::problems([
            'question_text' => 'Qual palavra é paroxítona?',
            'explanation' => 'A alternativa correta é a C.',
            'options' => [
                ['option_text' => 'lápis', 'is_correct' => true],
                ['option_text' => 'lápis', 'is_correct' => false],
            ],
        ]);

        $types = array_column($problems, 'tipo');
        $this->assertContains('ambiguidade', $types);
        $this->assertContains('inconsistencia_textual', $types);
    }

    public function test_identical_content_has_the_same_hash(): void
    {
        $question = [
            'question_text' => 'Quanto é 2 + 2?',
            'explanation' => 'Quatro.',
            'options' => [
                ['option_text' => '4', 'is_correct' => true],
                ['option_text' => '5', 'is_correct' => false],
            ],
        ];

        $this->assertSame(QuestionReviewRules::hash($question), QuestionReviewRules::hash($question));
    }
}
