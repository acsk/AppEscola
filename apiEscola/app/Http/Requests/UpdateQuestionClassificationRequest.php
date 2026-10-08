<?php

namespace App\Http\Requests;

use App\Models\ExamQuestion;
use App\Support\QuestionClassificationRequirement;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** PATCH da classificação de uma questão: campo ausente não altera; null remove o valor. */
class UpdateQuestionClassificationRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    /** Individual: disciplina e assunto não podem ser removidos (o lote continua livre para o "Desfazer"). */
    public function rules(): array
    {
        return self::classificationRules();
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if (! $this->has('subject_id') && ! $this->has('topic_ids')) {
                return;
            }
            $current = ExamQuestion::find((int) $this->route('question'));
            QuestionClassificationRequirement::validate($validator, $this->all(), $current);
        });
    }

    /** Regras compartilhadas com o lote (prefixo "items.*."). */
    public static function classificationRules(string $prefix = ''): array
    {
        return [
            $prefix.'difficulty_id' => ['sometimes', 'nullable', 'integer'],
            $prefix.'subject_id'    => ['sometimes', 'nullable', 'integer'],
            $prefix.'topic_ids'     => ['sometimes', 'nullable', 'array', 'max:30', self::uniqueWithinList()],
            $prefix.'topic_ids.*'   => ['integer'],
            $prefix.'board_id'      => ['sometimes', 'nullable', 'integer'],
            $prefix.'year'          => ['sometimes', 'nullable', 'integer', 'between:1900,2100'],
            $prefix.'exam_type_id'  => ['sometimes', 'required', 'integer'],
            $prefix.'is_annulled'   => ['sometimes', 'boolean'],
            $prefix.'is_outdated'   => ['sometimes', 'boolean'],
            $prefix.'tags'          => ['sometimes', 'nullable', 'array', 'max:20'],
            $prefix.'tags.*'        => ['string', 'max:50'],
            $prefix.'add_tags'      => ['sometimes', 'array', 'max:20'],
            $prefix.'add_tags.*'    => ['string', 'max:50'],
            $prefix.'remove_tags'   => ['sometimes', 'array', 'max:20'],
            $prefix.'remove_tags.*' => ['string', 'max:50'],
        ];
    }

    /** "distinct" com "items.*.topic_ids.*" compara entre TODAS as questões do lote; aqui vale só dentro da lista. */
    private static function uniqueWithinList(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            if (is_array($value) && count($value) !== count(array_unique($value, SORT_REGULAR))) {
                $fail('Não repita o mesmo assunto na questão.');
            }
        };
    }

    /**
     * Campos de classificação aceitos no formulário de questão de SIMULADO (mesmo detalhamento do banco).
     * Sem exam_type_id (o simulado envia o slug "exam_type") e sem add/remove_tags (só no lote).
     */
    public const EXAM_QUESTION_FIELDS = ['difficulty_id', 'topic_ids', 'board_id', 'year', 'is_annulled', 'is_outdated', 'tags'];

    public static function examQuestionRules(): array
    {
        return array_intersect_key(self::classificationRules(), array_flip([...self::EXAM_QUESTION_FIELDS, 'topic_ids.*', 'tags.*']));
    }

    public function attributes(): array
    {
        return [
            'difficulty_id' => 'dificuldade',
            'subject_id'    => 'disciplina',
            'topic_ids'     => 'assuntos',
            'board_id'      => 'banca',
            'year'          => 'ano',
            'exam_type_id'  => 'classificação de prova',
            'tags'          => 'tags',
        ];
    }
}
