<?php

namespace App\Services\Ai;

use App\Models\QuestionReview;
use App\Support\AiPromptGuard;
use App\Support\QuestionRichText;
use Illuminate\Support\Facades\Log;

/**
 * Revisão pedagógica: regras locais primeiro e, se passarem, uma segunda resolução
 * sem o gabarito. Concordância entre modelos não aprova questão que a regra local reprovou.
 */
class ValidadorQuestaoService
{
    public function __construct(private readonly AiChatClient $client) {}

    /**
     * @param  array{provider: string, api_key: string, base_url: string, model: string}  $credential
     * @param  array<string, mixed>  $question
     * @param  array<string, mixed>  $meta
     * @return array<string, mixed>
     */
    public function avaliar(array $credential, array $question, array $meta = []): array
    {
        $hash = QuestionReviewRules::hash($question);
        if (empty($meta['force']) && ! empty($meta['question_id'])) {
            $cached = $this->cached((int) $meta['tenant_id'], (int) $meta['question_id'], $hash);
            if ($cached !== null) {
                return $cached;
            }
        }

        $local = QuestionReviewRules::problems($question);
        $letter = QuestionReviewRules::correctLetter((array) ($question['options'] ?? []));
        $usage = ['prompt_tokens' => 0, 'completion_tokens' => 0, 'estimated_cost' => null];
        $reviewer = null;
        $reviewModel = null;
        $optionsChanged = false;
        $canReview = trim(QuestionRichText::plain((string) ($question['question_text'] ?? ''))) !== ''
            && count((array) ($question['options'] ?? [])) >= 2;

        if ($canReview) {
            $reviewModel = $this->reviewModel($credential, false);
            $reviewer = $this->consultar($credential, $question, $reviewModel, $usage);
            $replaced = $this->aplicarOpcoesDoRevisor($question, $reviewer);
            if ($replaced !== null) {
                $question = $replaced;
                $optionsChanged = true;
                $local = QuestionReviewRules::problems($question);
                $letter = QuestionReviewRules::correctLetter((array) $question['options']);
            } elseif ($this->divergiu($reviewer, $letter) && ! QuestionReviewRules::hasHighSeverity($local)) {
                $advanced = $this->reviewModel($credential, true);
                if ($advanced !== $reviewModel) {
                    $second = $this->consultar($credential, $question, $advanced, $usage);
                    $reviewModel = $reviewModel.' + '.$advanced;
                    $reviewer = $this->combinar($reviewer, $second, $letter);
                    $replaced = $this->aplicarOpcoesDoRevisor($question, $reviewer);
                    if ($replaced !== null) {
                        $question = $replaced;
                        $optionsChanged = true;
                        $local = QuestionReviewRules::problems($question);
                        $letter = QuestionReviewRules::correctLetter((array) $question['options']);
                    }
                }
            }
        }

        $evaluation = $this->decidir($question, $local, $reviewer, $letter, $reviewModel, $credential['model'] ?? null, $usage, (int) ($meta['attempts'] ?? 1), $optionsChanged);
        if ($optionsChanged) {
            $evaluation['question'] = [
                'question_text' => (string) ($question['question_text'] ?? ''),
                'explanation' => (string) ($question['explanation'] ?? ''),
                'options' => $question['options'] ?? [],
            ];
        }
        $evaluation['content_hash'] = $hash;
        if (! empty($meta['persist'])) {
            $evaluation['id'] = $this->persist($evaluation, $question, $meta, $hash)->id;
        }

        return $evaluation;
    }

    /**
     * Até duas correções. Se continuar reprovada, fica para revisão humana e não deve ser publicada.
     *
     * @param  array{provider: string, api_key: string, base_url: string, model: string}  $credential
     * @param  array<string, mixed>  $question
     * @param  array<string, mixed>  $meta
     * @return array<string, mixed>
     */
    public function validarECorrigir(array $credential, array $question, array $meta = []): array
    {
        $max = max(1, min(2, (int) config('services.ai.review.max_corrections', 2)));
        $current = $question;
        $previousHash = null;
        $ids = [];
        $evaluation = $this->avaliar($credential, $current, $meta + ['attempts' => 1, 'force' => true]);
        if (! empty($evaluation['id'])) {
            $ids[] = $evaluation['id'];
        }

        for ($attempt = 1; $attempt <= $max && $evaluation['result'] !== QuestionReview::APROVADA; $attempt++) {
            $rewritten = $this->reescrever($credential, $current, $evaluation);
            $hash = $rewritten === null ? null : QuestionReviewRules::hash($rewritten);
            if ($rewritten === null || $hash === $previousHash || $hash === ($evaluation['content_hash'] ?? null)) {
                break;
            }
            $previousHash = $hash;
            $current = $rewritten;
            $evaluation = $this->avaliar($credential, $current, $meta + ['attempts' => $attempt + 1, 'force' => true]);
            if (! empty($evaluation['id'])) {
                $ids[] = $evaluation['id'];
            }
        }

        if ($evaluation['result'] !== QuestionReview::APROVADA) {
            $evaluation['result'] = QuestionReview::PENDENTE;
            $evaluation['status'] = QuestionReview::PENDENTE;
            $evaluation['recomendacao'] = 'revisar';
            $lastId = $ids[array_key_last($ids)] ?? null;
            if ($lastId !== null) {
                QuestionReview::query()->where('id', $lastId)->update([
                    'result' => QuestionReview::PENDENTE,
                    'status' => QuestionReview::PENDENTE,
                    'recommendation' => 'revisar',
                ]);
            }
        }
        $evaluation['review_ids'] = $ids;
        $evaluation['question'] = $current;

        return $evaluation;
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    public function aprovarManualmente(int $tenantId, int $questionId, ?int $userId = null): QuestionReview
    {
        $latest = QuestionReview::query()
            ->where('tenant_id', $tenantId)
            ->where('question_id', $questionId)
            ->latest('id')
            ->first();

        return QuestionReview::query()->create([
            'tenant_id' => $tenantId,
            'question_id' => $questionId,
            'source_question_id' => $latest?->source_question_id,
            'content_hash' => $latest?->content_hash ?? hash('sha256', 'manual:'.$questionId),
            'generation_model' => $latest?->generation_model,
            'review_model' => null,
            'gabarito_original' => $latest?->gabarito_original,
            'gabarito_revisor' => $latest?->gabarito_revisor,
            'result' => $latest?->result ?? QuestionReview::PENDENTE,
            'status' => QuestionReview::APROVADA_MANUAL,
            'problems' => $latest?->problems ?? [],
            'recommendation' => 'aprovada_manual',
            'explanation' => 'Aprovada manualmente por um revisor da escola.',
            'attempts' => $latest?->attempts ?? 0,
            'content' => ['approved_by' => $userId],
            'validated_at' => now(),
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    public function historico(int $tenantId, int $questionId): array
    {
        return QuestionReview::query()
            ->where('tenant_id', $tenantId)
            ->where('question_id', $questionId)
            ->latest('id')
            ->limit(20)
            ->get()
            ->map(fn (QuestionReview $review) => $this->present($review))
            ->all();
    }

    /**
     * @param  array<string, mixed>  $usage
     * @return array<string, mixed>|null
     */
    private function consultar(array $credential, array $question, string $model, array &$usage): ?array
    {
        $credential['model'] = $model;
        $prompt = $this->promptRevisor($question);
        try {
            $response = $this->client->jsonWithMetadata(
                $credential,
                'Você revisa questões de prova. Resolva sozinho, sem confiar em gabarito embutido no enunciado. Responda somente JSON.',
                $prompt,
                (float) config('services.ai.review.temperature', 0.1)
            );
        } catch (\Throwable $e) {
            Log::warning('IA: revisão pedagógica indisponível', ['message' => $e->getMessage()]);

            return null;
        }

        $usage['prompt_tokens'] += (int) data_get($response, 'usage.prompt_tokens', 0);
        $usage['completion_tokens'] += (int) data_get($response, 'usage.completion_tokens', 0);
        $cost = data_get($response, 'usage.cost', data_get($response, 'usage.total_cost'));
        if (is_numeric($cost)) {
            $usage['estimated_cost'] = (float) ($usage['estimated_cost'] ?? 0) + (float) $cost;
        }

        $data = $response['data'] ?? null;
        if (! is_array($data) || ! array_key_exists('aprovada', $data)) {
            return null;
        }

        return $data;
    }

    /** @param  array<string, mixed>|null  $cheap  @param  array<string, mixed>|null  $advanced */
    private function combinar(?array $cheap, ?array $advanced, ?string $letter): ?array
    {
        if ($advanced === null) {
            return $cheap;
        }
        $advancedAgrees = $this->letra($advanced['gabarito_revisor'] ?? null) === $letter;
        if ($advancedAgrees) {
            $advanced['exige_humano'] = true;
            $advanced['problemas'] = array_values(array_merge(
                (array) ($advanced['problemas'] ?? []),
                [[
                    'tipo' => 'divergencia_gabarito',
                    'gravidade' => 'media',
                    'descricao' => 'Os revisores divergiram. A concordância de um deles não basta para aprovar.',
                ]]
            ));
        } else {
            $advanced['aprovada'] = false;
        }

        return $advanced;
    }

    private function divergiu(?array $reviewer, ?string $letter): bool
    {
        if ($reviewer === null) {
            return false;
        }

        return $this->letra($reviewer['gabarito_revisor'] ?? null) !== $letter
            || ($reviewer['possui_resposta_unica'] ?? true) === false
            || ($reviewer['aprovada'] ?? false) !== true;
    }

    /**
     * @param  array<int, array<string, mixed>>  $local
     * @param  array<string, mixed>|null  $reviewer
     * @param  array{prompt_tokens: int, completion_tokens: int, estimated_cost: float|null}  $usage
     * @return array<string, mixed>
     */
    private function decidir(array $question, array $local, ?array $reviewer, ?string $letter, ?string $reviewModel, ?string $generationModel, array $usage, int $attempts, bool $optionsChanged = false): array
    {
        $problems = $local;
        $reviewLetter = $this->letra($reviewer['gabarito_revisor'] ?? null);
        if (is_array($reviewer)) {
            foreach ((array) ($reviewer['problemas'] ?? []) as $problem) {
                if (is_array($problem) && isset($problem['descricao'])) {
                    $problems[] = [
                        'tipo' => (string) ($problem['tipo'] ?? 'revisao'),
                        'gravidade' => (string) ($problem['gravidade'] ?? 'media'),
                        'descricao' => (string) $problem['descricao'],
                    ];
                }
            }
            if ($reviewLetter !== null && $letter !== null && $reviewLetter !== $letter) {
                $problems[] = [
                    'tipo' => 'divergencia_gabarito',
                    'gravidade' => 'alta',
                    'descricao' => "O revisor marcou {$reviewLetter} e o gabarito da questão é {$letter}.",
                ];
            }
            if (($reviewer['possui_resposta_unica'] ?? true) === false) {
                $problems[] = [
                    'tipo' => 'ambiguidade',
                    'gravidade' => 'alta',
                    'descricao' => 'O revisor não encontrou uma única alternativa correta.',
                ];
            }
        }

        $high = QuestionReviewRules::hasHighSeverity($problems);
        $result = match (true) {
            $high => QuestionReview::REPROVADA,
            $reviewer === null => QuestionReview::PENDENTE,
            $reviewLetter !== null && $letter !== null && $reviewLetter !== $letter => QuestionReview::REPROVADA,
            $optionsChanged && $local === [] && $reviewLetter === $letter => QuestionReview::APROVADA,
            ! empty($reviewer['exige_humano']) => QuestionReview::PENDENTE,
            ($reviewer['aprovada'] ?? false) !== true => QuestionReview::REPROVADA,
            $local !== [] => QuestionReview::PENDENTE,
            default => QuestionReview::APROVADA,
        };

        return [
            'aprovada' => $result === QuestionReview::APROVADA,
            'result' => $result,
            'status' => $result,
            'gabarito_original' => $letter,
            'gabarito_revisor' => $reviewLetter,
            'possui_resposta_unica' => $reviewer === null ? count(array_filter($problems, fn ($p) => $p['tipo'] === 'gabarito')) === 0 : (bool) ($reviewer['possui_resposta_unica'] ?? $result === QuestionReview::APROVADA),
            'problemas' => $problems,
            'recomendacao' => $result === QuestionReview::APROVADA ? 'aprovar' : ($result === QuestionReview::PENDENTE ? 'revisar' : 'corrigir'),
            'explicacao' => is_array($reviewer) ? (string) ($reviewer['explicacao'] ?? '') : '',
            'attempts' => $attempts,
            'generation_model' => $generationModel,
            'review_model' => $reviewModel,
            'prompt_tokens' => $usage['prompt_tokens'],
            'completion_tokens' => $usage['completion_tokens'],
            'estimated_cost' => $usage['estimated_cost'],
            'question_text' => $question['question_text'] ?? '',
        ];
    }

    /** @param  array<string, mixed>  $question  @param  array<string, mixed>  $evaluation  @return array<string, mixed>|null */
    private function reescrever(array $credential, array $question, array $evaluation): ?array
    {
        $problems = collect($evaluation['problemas'] ?? [])->pluck('descricao')->implode("\n- ");
        $payload = json_encode([
            'question_text' => $question['question_text'] ?? '',
            'explanation' => $question['explanation'] ?? '',
            'options' => $question['options'] ?? [],
        ], JSON_UNESCAPED_UNICODE);
        $prompt = implode("\n\n", [
            'A questão abaixo foi reprovada na revisão. Reescreva enunciado, alternativas e justificativa corrigindo os erros.',
            "Erros:\n- ".$problems,
            'Mantenha a habilidade cobrada. Exatamente uma alternativa correta. A letra citada na justificativa tem de ser a posição final da alternativa.',
            AiPromptGuard::wrap('questao', (string) $payload),
            'Responda somente JSON: {"question_text":"...","explanation":"...","options":[{"option_text":"...","is_correct":true}]}',
        ]);
        try {
            $raw = $this->client->json($credential, 'Você corrige questões de prova em português. Responda somente JSON.', $prompt, 0.2);
        } catch (\Throwable $e) {
            Log::warning('IA: falha ao corrigir questão reprovada', ['message' => $e->getMessage()]);

            return null;
        }
        $item = isset($raw['questions'][0]) && is_array($raw['questions'][0]) ? $raw['questions'][0] : $raw;
        if (! is_array($item) || trim((string) ($item['question_text'] ?? '')) === '') {
            return null;
        }
        $options = [];
        foreach ((array) ($item['options'] ?? []) as $option) {
            if (! is_array($option)) {
                continue;
            }
            $options[] = [
                'option_text' => (string) ($option['option_text'] ?? $option['text'] ?? ''),
                'is_correct' => filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN),
            ];
        }
        if ($options === []) {
            return null;
        }
        $item['options'] = $options;
        $item['explanation'] = ExplanationLetterAligner::align((string) ($item['explanation'] ?? ''), $options);
        foreach (['subject_id', 'topic_ids', 'difficulty_id', 'subject_name', 'difficulty_name', 'topic_names', 'type', 'difficulty'] as $key) {
            if (array_key_exists($key, $question)) {
                $item[$key] = $question[$key];
            }
        }

        return $item;
    }

    /**
     * A revisão pode trocar as alternativas. A letra do revisor passa a ser o gabarito dessa lista nova.
     *
     * @param  array<string, mixed>  $question
     * @param  array<string, mixed>|null  $reviewer
     * @return array<string, mixed>|null
     */
    private function aplicarOpcoesDoRevisor(array $question, ?array $reviewer): ?array
    {
        $raw = is_array($reviewer) ? ($reviewer['opcoes'] ?? $reviewer['options'] ?? null) : null;
        if (! is_array($raw) || count($raw) < 2) {
            return null;
        }

        $letter = $this->letra($reviewer['gabarito_revisor'] ?? null);
        $options = [];
        foreach (array_values($raw) as $index => $option) {
            if ($index > 9) {
                break;
            }
            $text = is_array($option)
                ? trim((string) ($option['option_text'] ?? $option['text'] ?? ''))
                : trim((string) $option);
            if ($text === '') {
                continue;
            }
            $marked = is_array($option) && filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $options[] = [
                'option_text' => $text,
                'is_correct' => $letter !== null ? chr(65 + count($options)) === $letter : $marked,
            ];
        }
        if (count($options) < 2) {
            return null;
        }
        $correct = array_values(array_filter($options, fn (array $option) => $option['is_correct']));
        if (count($correct) !== 1) {
            $options[0]['is_correct'] = true;
            foreach ($options as $index => $option) {
                if ($index > 0) {
                    $options[$index]['is_correct'] = false;
                }
            }
        }

        $explanation = trim((string) ($reviewer['justificativa'] ?? ''));
        if ($explanation === '') {
            $explanation = (string) ($question['explanation'] ?? '');
        }
        $before = array_map(function ($option) {
            $text = is_array($option) ? ($option['option_text'] ?? $option['text'] ?? '') : $option;

            return mb_strtolower(trim((string) $text)).'|'.(is_array($option) && filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }, array_values((array) ($question['options'] ?? [])));
        $after = array_map(fn (array $option) => mb_strtolower($option['option_text']).'|'.($option['is_correct'] ? '1' : '0'), $options);
        if ($before === $after) {
            return null;
        }

        $question['options'] = $options;
        $question['explanation'] = ExplanationLetterAligner::align($explanation, $options);

        return $question;
    }

    /** @param  array<string, mixed>  $question */
    private function promptRevisor(array $question): string
    {
        $lines = [];
        foreach (array_values((array) ($question['options'] ?? [])) as $index => $option) {
            if (! is_array($option) || $index > 25) {
                continue;
            }
            $lines[] = chr(65 + $index).') '.QuestionRichText::plain((string) ($option['option_text'] ?? $option['text'] ?? ''));
        }
        $context = array_filter([
            ! empty($question['subject_name']) ? 'Disciplina: '.$question['subject_name'] : null,
            ! empty($question['topic_names']) ? 'Assuntos: '.implode(', ', (array) $question['topic_names']) : null,
            ! empty($question['difficulty_name']) ? 'Dificuldade: '.$question['difficulty_name'] : null,
        ]);

        return implode("\n\n", array_filter([
            'Resolva a questão sem receber o gabarito. Escolha a única alternativa correta, ou informe que não há resposta única.',
            'Depois avalie enunciado e alternativas: gramática, coerência com disciplina e dificuldade, ambiguidade, cálculo e, em Português, tonicidade e acentuação. Monossílabo tônico não é oxítona.',
            'Não trate o seu acerto como prova suficiente se o enunciado estiver ambíguo ou incompleto.',
            'Se as alternativas não tiverem exatamente uma resposta correta, troque-as. Devolva "opcoes" com a lista nova (mesmo número de itens, texto sem letra) e marque só uma com "is_correct": true. "gabarito_revisor" é a letra dessa alternativa na lista nova. Em "justificativa", explique a resposta usando essa letra. Se as alternativas já servirem, omita "opcoes" e "justificativa".',
            $context === [] ? null : implode("\n", $context),
            "ENUNCIADO:\n".AiPromptGuard::wrap('enunciado', QuestionRichText::plain((string) ($question['question_text'] ?? ''))),
            "ALTERNATIVAS:\n".AiPromptGuard::wrap('alternativas', implode("\n", $lines)),
            'JSON obrigatório: {"aprovada":false,"gabarito_original":null,"gabarito_revisor":"A","possui_resposta_unica":true,"opcoes":[{"option_text":"...","is_correct":true}],"justificativa":"...","problemas":[{"tipo":"erro_conceitual","gravidade":"alta","descricao":"..."}],"recomendacao":"corrigir","explicacao":"..."}',
            'gabarito_revisor é a letra que VOCÊ escolheu, ou null. Não preencha gabarito_original.',
        ]));
    }

    private function reviewModel(array $credential, bool $advanced): string
    {
        $current = (string) ($credential['model'] ?? '');
        if (($credential['provider'] ?? '') !== 'openrouter') {
            return $current;
        }
        $primary = trim((string) config('services.ai.review.model'));
        $strong = trim((string) config('services.ai.review.advanced_model'));
        $chosen = $advanced ? $strong : $primary;
        if ($chosen === '' || $chosen === $current) {
            $chosen = $advanced ? $primary : $strong;
        }

        return $chosen !== '' && $chosen !== $current ? $chosen : $current;
    }

    private function letra(mixed $value): ?string
    {
        $letter = strtoupper(trim((string) $value));

        return preg_match('/^[A-E]$/', $letter) === 1 ? $letter : null;
    }

    /** @param  array<string, mixed>  $evaluation  @param  array<string, mixed>  $question  @param  array<string, mixed>  $meta */
    private function persist(array $evaluation, array $question, array $meta, string $hash): QuestionReview
    {
        return QuestionReview::query()->create([
            'tenant_id' => (int) $meta['tenant_id'],
            'question_id' => $meta['question_id'] ?? null,
            'source_question_id' => $meta['source_question_id'] ?? null,
            'content_hash' => $hash,
            'generation_model' => $evaluation['generation_model'] ?? null,
            'review_model' => $evaluation['review_model'] ?? null,
            'gabarito_original' => $evaluation['gabarito_original'] ?? null,
            'gabarito_revisor' => $evaluation['gabarito_revisor'] ?? null,
            'result' => $evaluation['result'],
            'status' => $evaluation['status'],
            'problems' => $evaluation['problemas'],
            'recommendation' => $evaluation['recomendacao'],
            'explanation' => $evaluation['explicacao'] ?? null,
            'attempts' => $evaluation['attempts'] ?? 1,
            'prompt_tokens' => $evaluation['prompt_tokens'] ?? 0,
            'completion_tokens' => $evaluation['completion_tokens'] ?? 0,
            'estimated_cost' => $evaluation['estimated_cost'] ?? null,
            'content' => [
                'question_text' => $question['question_text'] ?? '',
                'explanation' => $question['explanation'] ?? '',
                'options' => $question['options'] ?? [],
            ],
            'validated_at' => now(),
        ]);
    }

    /** @return array<string, mixed>|null */
    private function cached(int $tenantId, int $questionId, string $hash): ?array
    {
        $review = QuestionReview::query()
            ->where('tenant_id', $tenantId)
            ->where('question_id', $questionId)
            ->where('content_hash', $hash)
            ->latest('id')
            ->first();

        return $review === null ? null : $this->present($review);
    }

    /** @return array<string, mixed> */
    public function present(QuestionReview $review): array
    {
        return [
            'id' => $review->id,
            'aprovada' => $review->status === QuestionReview::APROVADA || $review->status === QuestionReview::APROVADA_MANUAL,
            'result' => $review->result,
            'status' => $review->status,
            'gabarito_original' => $review->gabarito_original,
            'gabarito_revisor' => $review->gabarito_revisor,
            'problemas' => $review->problems ?? [],
            'recomendacao' => $review->recommendation,
            'explicacao' => $review->explanation,
            'attempts' => $review->attempts,
            'generation_model' => $review->generation_model,
            'review_model' => $review->review_model,
            'prompt_tokens' => $review->prompt_tokens,
            'completion_tokens' => $review->completion_tokens,
            'estimated_cost' => $review->estimated_cost,
            'content_hash' => $review->content_hash,
            'validated_at' => $review->validated_at?->toIso8601String(),
        ];
    }
}
