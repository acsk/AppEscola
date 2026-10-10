<?php

namespace Tests\Unit;

use App\Services\Ai\ReviewAnswerApplier;
use PHPUnit\Framework\TestCase;

class ReviewAnswerApplierTest extends TestCase
{
    public function test_a_single_marked_option_wins_over_a_copied_letter(): void
    {
        $applied = ReviewAnswerApplier::apply([
            'explanation' => 'A correta é a letra A.',
            'options' => [
                ['option_text' => 'fácil', 'is_correct' => true],
                ['option_text' => 'café', 'is_correct' => false],
            ],
        ], [
            'gabarito_revisor' => 'A',
            'opcoes' => [
                ['option_text' => 'fácil', 'is_correct' => false],
                ['option_text' => 'café', 'is_correct' => true],
            ],
            'justificativa' => 'A alternativa correta é a letra A café, oxítona.',
        ]);

        $this->assertSame('B', $applied['gabarito']);
        $this->assertTrue($applied['question']['options'][1]['is_correct']);
        $this->assertFalse($applied['question']['options'][0]['is_correct']);
        $this->assertStringContainsString('B café', $applied['question']['explanation']);
    }

    public function test_reviewer_letter_moves_the_mark_and_replaces_the_explanation(): void
    {
        $applied = ReviewAnswerApplier::apply([
            'explanation' => 'A correta é a letra A fácil.',
            'options' => [
                ['option_text' => 'fácil', 'is_correct' => true],
                ['option_text' => 'café', 'is_correct' => false],
            ],
        ], [
            'gabarito_revisor' => 'B',
            'justificativa' => 'A correta é a letra B café, porque a última sílaba é tônica.',
        ]);

        $this->assertSame('B', $applied['gabarito']);
        $this->assertTrue($applied['changed']);
        $this->assertTrue($applied['question']['options'][1]['is_correct']);
        $this->assertStringContainsString('café', $applied['question']['explanation']);
    }
}
