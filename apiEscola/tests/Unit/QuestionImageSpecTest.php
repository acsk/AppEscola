<?php

namespace Tests\Unit;

use App\Exceptions\AiException;
use App\Support\QuestionImageSpec;
use Tests\TestCase;

class QuestionImageSpecTest extends TestCase
{
    public function test_prompt_uses_new_numbers_and_not_original_values_or_answer(): void
    {
        $prompt = QuestionImageSpec::generationPrompt([
            'question_text' => 'Um triângulo tem lados de 6 cm, 8 cm e 10 cm.',
            'explanation' => 'Resposta secreta: alternativa C.',
        ], [
            'tipo' => 'FIGURA_GEOMETRICA',
            'labels' => [['elemento' => 'AB', 'texto' => '6 cm'], ['elemento' => 'BC', 'texto' => '8 cm'], ['elemento' => 'AC', 'texto' => '10 cm']],
        ]);
        foreach (['6 cm', '8 cm', '10 cm'] as $value) {
            $this->assertStringContainsString($value, $prompt);
        }
        foreach (['3 cm', '4 cm', '5 cm', 'Resposta secreta'] as $value) {
            $this->assertStringNotContainsString($value, $prompt);
        }
    }

    public function test_invalid_spec_is_rejected(): void
    {
        $this->expectException(AiException::class);
        QuestionImageSpec::spec(['tipo' => 'inventado']);
    }

    public function test_unreadable_analysis_does_not_require_invented_visual_details(): void
    {
        $this->assertSame(['status' => 'NEEDS_REVIEW', 'motivo' => 'Imagem ilegível.'],
            QuestionImageSpec::analysis(['status' => 'NEEDS_REVIEW', 'motivo' => 'Imagem ilegível.']));
    }

    public function test_invalid_validation_confidence_is_rejected(): void
    {
        $this->expectException(AiException::class);
        QuestionImageSpec::validation(['valida' => true, 'confidence' => 94, 'problemas' => [], 'recomendacao' => null]);
    }

    public function test_fingerprint_detects_changed_numbers_and_answer(): void
    {
        $content = ['type' => 'multiple_choice', 'question_text' => '6 cm', 'options' => [
            ['option_text' => '10', 'is_correct' => true], ['option_text' => '8', 'is_correct' => false],
        ]];
        $edited = $content;
        $edited['question_text'] = '3 cm';
        $this->assertNotSame(QuestionImageSpec::fingerprint($content), QuestionImageSpec::fingerprint($edited));
        $edited = $content;
        $edited['options'][0]['is_correct'] = false;
        $this->assertNotSame(QuestionImageSpec::fingerprint($content), QuestionImageSpec::fingerprint($edited));
    }
}
