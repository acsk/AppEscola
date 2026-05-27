<?php

namespace Tests\Unit;

use App\Http\Requests\StorePastExamRequest;
use Illuminate\Support\Facades\Validator;
use ReflectionMethod;
use Tests\TestCase;

class StorePastExamRequestScheduleTest extends TestCase
{
    private function validateAfterPrepare(array $payload): \Illuminate\Validation\Validator
    {
        $request = StorePastExamRequest::create('/api/past-exams', 'POST', $payload);
        $request->setContainer($this->app);

        $prepare = new ReflectionMethod(StorePastExamRequest::class, 'prepareForValidation');
        $prepare->setAccessible(true);
        $prepare->invoke($request);

        $form = new StorePastExamRequest;
        $form->setContainer($this->app);
        $form->merge($request->all());

        $validator = Validator::make(
            $form->all(),
            [
                'exam_year'     => ['nullable', 'integer', 'min:1990', 'max:2100'],
                'exam_date'     => ['nullable', 'date_format:Y-m-d'],
                'material_kind' => ['nullable', 'in:prova,exercicio'],
            ],
            $form->messages(),
        );
        $form->withValidator($validator);

        return $validator;
    }

    public function test_exam_date_only_derives_exam_year_and_passes_validation(): void
    {
        $validator = $this->validateAfterPrepare([
            'title'         => 'Prova ENEM',
            'type'          => 'file',
            'content'       => 'https://example.com/prova.pdf',
            'exam_date'     => '2024-03-15',
            'exam_year'     => '',
            'material_kind' => 'prova',
        ]);

        $this->assertTrue($validator->passes());
        $this->assertSame(2024, $validator->getData()['exam_year']);
        $this->assertSame('2024-03-15', $validator->getData()['exam_date']);
    }

    public function test_empty_exam_year_fails_when_material_kind_is_prova(): void
    {
        $validator = $this->validateAfterPrepare([
            'title'          => 'Prova ENEM',
            'type'           => 'file',
            'content'        => 'https://example.com/prova.pdf',
            'exam_year'      => '',
            'material_kind'  => 'prova',
        ]);

        $this->assertFalse($validator->passes());
        $this->assertTrue($validator->errors()->has('exam_date'));
    }

    public function test_empty_exam_year_is_allowed_for_exercicio(): void
    {
        $validator = $this->validateAfterPrepare([
            'title'         => 'Lista 1',
            'type'          => 'file',
            'content'       => 'https://example.com/lista.pdf',
            'exam_year'     => '',
            'material_kind' => 'exercicio',
        ]);

        $this->assertTrue($validator->passes());
        $this->assertNull($validator->getData()['exam_year']);
    }

    public function test_zero_exam_year_is_normalized_to_null_for_exercicio(): void
    {
        $validator = $this->validateAfterPrepare([
            'title'         => 'Lista 1',
            'type'          => 'file',
            'content'       => 'https://example.com/lista.pdf',
            'exam_year'     => 0,
            'material_kind' => 'exercicio',
        ]);

        $this->assertTrue($validator->passes());
        $this->assertNull($validator->getData()['exam_year']);
    }

    public function test_exam_date_before_1990_fails_with_min_rule(): void
    {
        $validator = $this->validateAfterPrepare([
            'title'         => 'Prova antiga',
            'type'          => 'file',
            'content'       => 'https://example.com/prova.pdf',
            'exam_date'     => '1989-12-31',
            'material_kind' => 'prova',
        ]);

        $this->assertFalse($validator->passes());
        $this->assertTrue($validator->errors()->has('exam_year'));
    }

    public function test_invalid_exam_date_does_not_throw_during_prepare_and_fails_date_rule(): void
    {
        foreach (['2024-13-01', 'invalid-date'] as $invalidDate) {
            $validator = $this->validateAfterPrepare([
                'title'         => 'Prova ENEM',
                'type'          => 'file',
                'content'       => 'https://example.com/prova.pdf',
                'exam_date'     => $invalidDate,
                'material_kind' => 'prova',
            ]);

            $this->assertFalse($validator->passes(), "Expected validation failure for: {$invalidDate}");
            $this->assertTrue($validator->errors()->has('exam_date'), "Expected exam_date error for: {$invalidDate}");
            $this->assertSame($invalidDate, $validator->getData()['exam_date']);
        }
    }
}
