<?php

namespace Tests\Unit;

use App\Services\Ai\ExplanationLetterAligner;
use PHPUnit\Framework\TestCase;

class ExplanationLetterAlignerTest extends TestCase
{
    public function test_letter_next_to_the_option_text_follows_the_final_position(): void
    {
        $options = [
            ['option_text' => 'Lápis', 'is_correct' => true],
            ['option_text' => 'Café', 'is_correct' => false],
            ['option_text' => 'Árvore', 'is_correct' => false],
        ];

        $aligned = ExplanationLetterAligner::align(
            'A alternativa correta é a C) Lápis, porque a penúltima sílaba é a tônica.',
            $options
        );

        $this->assertStringContainsString('A) Lápis', $aligned);
        $this->assertStringNotContainsString('C) Lápis', $aligned);
        $this->assertStringContainsString('correta é a A', $aligned);
    }

    public function test_correct_claim_without_the_option_text_uses_the_marked_letter(): void
    {
        $options = [
            ['option_text' => 'Lápis', 'is_correct' => true],
            ['option_text' => 'Café', 'is_correct' => false],
        ];

        $aligned = ExplanationLetterAligner::align('A alternativa correta é a letra C.', $options);

        $this->assertSame('A alternativa correta é a letra A.', $aligned);
    }

    public function test_shuffle_remap_does_not_swap_letters_twice(): void
    {
        $remapped = ExplanationLetterAligner::remap("A) um texto longo\nC) dois texto longo", [
            'A' => 'C',
            'B' => 'B',
            'C' => 'A',
        ]);

        $this->assertSame("C) um texto longo\nA) dois texto longo", $remapped);
    }

    public function test_remap_then_align_keeps_the_option_text_with_its_new_letter(): void
    {
        $options = [
            ['option_text' => 'Lápis', 'is_correct' => true],
            ['option_text' => 'Café', 'is_correct' => false],
            ['option_text' => 'Árvore', 'is_correct' => false],
        ];
        $remapped = ExplanationLetterAligner::remap('C Lápis é paroxítona. A alternativa correta é a letra C.', [
            'A' => 'B',
            'B' => 'C',
            'C' => 'A',
        ]);

        $aligned = ExplanationLetterAligner::align($remapped, $options);

        $this->assertStringContainsString('A Lápis', $aligned);
        $this->assertStringContainsString('letra A', $aligned);
    }

    public function test_short_numeric_options_do_not_rewrite_years(): void
    {
        $options = [
            ['option_text' => '4', 'is_correct' => true],
            ['option_text' => '3', 'is_correct' => false],
        ];

        $aligned = ExplanationLetterAligner::align('Em 1945 a conta fecha. A resposta é a letra B) 4.', $options);

        $this->assertStringContainsString('Em 1945', $aligned);
        $this->assertStringContainsString('A) 4', $aligned);
    }
}
