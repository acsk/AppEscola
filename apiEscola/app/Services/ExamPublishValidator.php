<?php

namespace App\Services;

use App\Models\Exam;
use Illuminate\Validation\Validator;

class ExamPublishValidator
{
    public function validate(Validator $validator, Exam $exam, string $targetStatus): void
    {
        if ($targetStatus !== 'published') {
            return;
        }

        $exam->loadMissing(['questions.options']);

        if ($exam->questions->isEmpty()) {
            $validator->errors()->add(
                'status',
                'Não é possível publicar um simulado sem questões.'
            );

            return;
        }

        foreach ($exam->questions as $question) {
            if ($question->type !== 'multiple_choice') {
                continue;
            }

            $correctCount = $question->options->where('is_correct', true)->count();

            if ($correctCount !== 1) {
                $validator->errors()->add(
                    'status',
                    "A questão #{$question->order} deve ter exatamente uma alternativa correta."
                );
            }
        }
    }
}
