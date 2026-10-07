<?php

namespace App\Http\Requests;

use App\Support\AiPromptGuard;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /question-bank/ai/extract — blocos de texto de PDF (já preparados no painel: um por questão).
 * Limites para conter custo e abuso: até 5 blocos por chamada e 8 mil caracteres por bloco.
 */
class QuestionAiExtractRequest extends FormRequest
{
    public const MAX_BLOCKS = 5;

    public const MAX_BLOCK_CHARS = 8000;

    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'blocks'               => ['required', 'array', 'min:1', 'max:'.self::MAX_BLOCKS],
            'blocks.*.text'        => ['required', 'string', 'min:10', 'max:'.self::MAX_BLOCK_CHARS],
            'blocks.*.answer_hint' => ['sometimes', 'nullable', 'string', 'regex:/^[A-Ja-j]$/'],
        ];
    }

    public function attributes(): array
    {
        return [
            'blocks'               => 'blocos',
            'blocks.*.text'        => 'texto do bloco',
            'blocks.*.answer_hint' => 'gabarito do bloco',
        ];
    }

    public function messages(): array
    {
        return [
            'blocks.max'      => 'Envie no máximo '.self::MAX_BLOCKS.' blocos por vez.',
            'blocks.*.text.max' => 'Cada questão pode ter no máximo '.self::MAX_BLOCK_CHARS.' caracteres. Divida o bloco.',
        ];
    }

    /** Remove caracteres de controle e marcadores de chat do texto bruto do PDF antes da validação. */
    protected function prepareForValidation(): void
    {
        $blocks = $this->input('blocks');
        if (! is_array($blocks)) {
            return;
        }
        $this->merge(['blocks' => array_map(function ($block) {
            if (is_array($block) && is_string($block['text'] ?? null)) {
                $block['text'] = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $block['text']) ?? '');
                $block['text'] = AiPromptGuard::clean($block['text']);
            }

            return $block;
        }, $blocks)]);
    }
}
