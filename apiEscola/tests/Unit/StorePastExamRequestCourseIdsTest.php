<?php

namespace Tests\Unit;

use App\Http\Requests\StorePastExamRequest;
use Illuminate\Support\Facades\Validator;
use ReflectionMethod;
use Tests\TestCase;

class StorePastExamRequestCourseIdsTest extends TestCase
{
    private function validateAfterPrepare(array $payload): \Illuminate\Validation\Validator
    {
        $request = StorePastExamRequest::create('/api/past-exams', 'POST', $payload);
        $request->setContainer($this->app);

        $prepare = new ReflectionMethod(StorePastExamRequest::class, 'prepareForValidation');
        $prepare->setAccessible(true);
        $prepare->invoke($request);

        return Validator::make($request->all(), (new StorePastExamRequest)->rules());
    }

    public function test_boolean_course_ids_is_rejected_not_coerced_to_course_one(): void
    {
        $validator = $this->validateAfterPrepare([
            'title'      => 'Prova ENEM',
            'type'       => 'file',
            'content'    => 'https://example.com/prova.pdf',
            'course_ids' => true,
        ]);

        $this->assertFalse($validator->passes());
        $this->assertTrue($validator->errors()->has('course_ids'));
        $this->assertTrue($validator->errors()->first('course_ids') !== '');
    }

    public function test_boolean_element_in_course_ids_array_is_rejected(): void
    {
        $validator = $this->validateAfterPrepare([
            'title'      => 'Prova ENEM',
            'type'       => 'file',
            'content'    => 'https://example.com/prova.pdf',
            'course_ids' => [true],
        ]);

        $this->assertFalse($validator->passes());
        $this->assertTrue($validator->errors()->has('course_ids.0'));
    }

}
