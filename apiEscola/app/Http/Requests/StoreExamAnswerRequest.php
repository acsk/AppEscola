<?php

namespace App\Http\Requests;

use App\Models\ExamAttempt;
use App\Models\ExamQuestion;
use App\Services\ExamAccessService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreExamAnswerRequest extends FormRequest
{
    public function authorize(): bool
    {
        $attempt = $this->route('attempt');

        if (! $attempt instanceof ExamAttempt) {
            return false;
        }

        app(ExamAccessService::class)->authorizeAttemptAnswer($this, $attempt);

        return true;
    }

    public function rules(): array
    {
        return [
            'question_id' => ['required', 'integer'],
            'option_id'   => ['nullable', 'integer'],
            'text_answer' => ['nullable', 'string'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            /** @var ExamAttempt $attempt */
            $attempt = $this->route('attempt');

            $question = ExamQuestion::query()
                ->where('id', $this->integer('question_id'))
                ->where('exam_id', $attempt->exam_id)
                ->with('options')
                ->first();

            if (! $question) {
                $validator->errors()->add('question_id', 'Questão inválida para este simulado.');

                return;
            }

            $optionId = $this->input('option_id');
            $textAnswer = trim((string) $this->input('text_answer', ''));

            if ($optionId !== null) {
                $optionExists = $question->options->contains('id', (int) $optionId);

                if (! $optionExists) {
                    $validator->errors()->add('option_id', 'Opção inválida para esta questão.');

                    return;
                }
            }

            if ($question->type === 'essay') {
                if ($textAnswer === '') {
                    $validator->errors()->add('text_answer', 'Informe a resposta discursiva.');
                }

                return;
            }

            if ($question->type !== 'multiple_choice') {
                return;
            }

            if ($optionId === null && $textAnswer === '') {
                $validator->errors()->add(
                    'option_id',
                    'Selecione uma opção ou informe uma resposta em texto.'
                );

                return;
            }

            if ($optionId !== null) {
                $selectedOption = $question->options->firstWhere('id', (int) $optionId);

                if ($selectedOption?->triggers_text_input && $textAnswer === '') {
                    $validator->errors()->add(
                        'text_answer',
                        'Esta opção exige que você descreva sua resposta.'
                    );
                }

                if ($question->allow_text_answer && $textAnswer === '') {
                    $validator->errors()->add(
                        'text_answer',
                        'Informe a justificativa da resposta selecionada.'
                    );
                }
            }
        });
    }
}
