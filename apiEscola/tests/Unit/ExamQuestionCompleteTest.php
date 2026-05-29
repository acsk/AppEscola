<?php

namespace Tests\Unit;

use App\Models\ExamQuestion;
use App\Models\ExamQuestionOption;
use Illuminate\Support\Collection;
use PHPUnit\Framework\TestCase;

class ExamQuestionCompleteTest extends TestCase
{
    public function test_multiple_choice_question_is_complete_with_enunciado_and_one_correct_option(): void
    {
        $question = $this->makeQuestion('multiple_choice', 'Enunciado', null, '2.00', [
            ['A', true],
            ['B', false],
        ]);

        $this->assertTrue($question->isComplete());
    }

    public function test_multiple_choice_question_is_incomplete_without_enunciado(): void
    {
        $question = $this->makeQuestion('multiple_choice', null, null, '1.00', [
            ['A', true],
            ['B', false],
        ]);

        $this->assertFalse($question->isComplete());
    }

    public function test_multiple_choice_question_is_complete_with_image_only_enunciado(): void
    {
        $question = $this->makeQuestion('multiple_choice', null, 'https://example.com/q.png', '1.00', [
            ['A', true],
            ['B', false],
        ]);

        $this->assertTrue($question->isComplete());
    }

    public function test_multiple_choice_question_requires_exactly_one_correct_option(): void
    {
        $question = $this->makeQuestion('multiple_choice', 'Enunciado', null, '1.00', [
            ['A', true],
            ['B', true],
        ]);

        $this->assertFalse($question->isComplete());
    }

    public function test_essay_question_is_complete_with_enunciado_and_points(): void
    {
        $question = $this->makeQuestion('essay', 'Dissertação', null, '5.00', []);

        $this->assertTrue($question->isComplete());
    }

    /**
     * @param  array<int, array{0: string, 1: bool}>  $options
     */
    private function makeQuestion(
        string $type,
        ?string $questionText,
        ?string $imageUrl,
        string $points,
        array $options,
    ): ExamQuestion {
        $question = new ExamQuestion([
            'type' => $type,
            'question_text' => $questionText,
            'image_url' => $imageUrl,
            'points' => $points,
            'order' => 1,
        ]);

        $optionModels = collect($options)->values()->map(function (array $row, int $index) {
            return new ExamQuestionOption([
                'option_text' => $row[0],
                'is_correct' => $row[1],
                'order' => $index + 1,
            ]);
        });

        $question->setRelation('options', new Collection($optionModels));

        return $question;
    }
}
