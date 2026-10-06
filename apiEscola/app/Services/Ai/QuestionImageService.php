<?php

namespace App\Services\Ai;

use App\Exceptions\AiException;
use App\Models\ExamQuestion;
use App\Models\QuestionImageGeneration;
use App\Models\User;
use App\Support\AiPromptGuard;
use App\Support\QuestionImageSpec;
use App\Support\QuestionRichText;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use League\Flysystem\FilesystemException;

class QuestionImageService
{
    public function __construct(
        private readonly AiCredentialResolver $resolver,
        private readonly AiModelRouter $router,
        private readonly QuestionImageStorage $storage,
    ) {}

    public function prepare(?User $user, int $tenantId, ExamQuestion $source): array
    {
        $credential = $this->credential($user, $tenantId);
        $audit = QuestionImageGeneration::create([
            'tenant_id' => $tenantId,
            'source_question_id' => $source->id,
            'created_by' => $user?->id,
            'status' => 'ANALYZING',
        ]);
        $started = microtime(true);
        try {
            $image = $this->storage->source($source);
            $sourceData = [
                'question_text' => QuestionRichText::plain($source->question_text),
                'options' => $source->options->map(fn ($option) => [
                    'option_text' => QuestionRichText::plain($option->option_text), 'is_correct' => $option->is_correct,
                ])->all(),
                'subject' => $source->subject?->name,
                'topics' => $source->topics->pluck('name')->all(),
            ];
            $prompt = "Compreenda a imagem e sua função pedagógica na questão. Não invente medidas nem informações ilegíveis.\n"
                ."Imagens com texto, enunciado, fórmulas ou expressões matemáticas que você consegue ler são READY (mesmo que sejam o próprio enunciado).\n"
                ."NEEDS_REVIEW só para: documentos oficiais, fotografias de identificação, ou imagem que você realmente não consegue ler; informe o motivo.\n"
                .AiPromptGuard::wrap('questao_original', json_encode($sourceData, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR))
                ."\nFormato JSON obrigatório:\n".json_encode([
                    'status' => 'READY | NEEDS_REVIEW', 'motivo' => null,
                    'tipo' => implode(' | ', QuestionImageSpec::TYPES), 'descricao' => 'descrição fiel',
                    'funcao_na_questao' => 'função pedagógica',
                    'elementos_obrigatorios' => ['elementos'], 'elementos_que_podem_mudar' => ['dados'],
                    'restricoes' => ['não revelar a resposta'],
                ], JSON_UNESCAPED_UNICODE);
            $result = $this->router->vision($credential, $this->system(), $prompt, [$image]);
            $analysis = QuestionImageSpec::analysis($result['data']);
            $audit->update([
                'status' => $analysis['status'] === 'READY' ? 'ANALYZED' : 'NEEDS_REVIEW',
                'analysis' => $analysis, 'prompt' => $prompt, 'model' => $result['model'],
                'metadata' => $this->metadata($result), 'error' => $analysis['motivo'] ?? null,
            ]);
            if ($analysis['status'] !== 'READY') {
                throw new AiException($analysis['motivo'], 422, 'image_needs_review');
            }

            return ['credential' => $credential, 'image' => $image, 'analysis' => $analysis, 'analysis_id' => $audit->id];
        } catch (AiException $e) {
            $audit->update(['status' => 'NEEDS_REVIEW', 'error' => $e->getMessage()]);
            throw $e;
        } catch (FilesystemException $e) {
            $audit->update(['status' => 'NEEDS_REVIEW', 'error' => 'Falha ao ler a imagem original.']);
            throw new AiException('Não foi possível ler a imagem original. Verifique o armazenamento.', 422, 'image_needs_review');
        } finally {
            $audit->update(['duration_ms' => (int) ((microtime(true) - $started) * 1000)]);
            $this->log($audit);
        }
    }

    public function recreate(array $context, string $system, string $prompt): array
    {
        $result = $this->router->vision($context['credential'], $system, $prompt, [$context['image']]);
        $audit = QuestionImageGeneration::findOrFail($context['analysis_id']);
        $audit->update([
            'metadata' => [
                'analysis' => $audit->metadata,
                'recreation' => $this->metadata($result),
            ],
        ]);

        return $result['data'];
    }

    public function create(?User $user, int $tenantId, ExamQuestion $source, array $content, array $raw, array $context): array
    {
        if (! is_bool($raw['possui_imagem'] ?? null)) {
            $message = 'A IA não informou corretamente se a nova questão precisa de imagem (possui_imagem deve ser true ou false). '
                .'A geração foi interrompida para não descartar uma imagem necessária. Revise a referência antes de tentar novamente.';
            QuestionImageGeneration::query()->where('tenant_id', $tenantId)->whereKey($context['analysis_id'])
                ->update(['status' => 'NEEDS_REVIEW', 'error' => $message]);
            Log::warning('IA: decisão visual inválida', [
                'tenant_id' => $tenantId, 'analysis_id' => $context['analysis_id'],
                'field' => 'possui_imagem', 'received_type' => get_debug_type($raw['possui_imagem'] ?? null),
            ]);
            throw new AiException($message, 422, 'image_needs_review');
        }
        if ($raw['possui_imagem'] === false) {
            return $content + ['possui_imagem' => false];
        }
        $spec = QuestionImageSpec::spec(is_array($raw['image_spec'] ?? null) ? $raw['image_spec'] : []);
        $generation = QuestionImageGeneration::create([
            'tenant_id' => $tenantId, 'source_question_id' => $source->id, 'created_by' => $user?->id,
            'content' => $content, 'analysis' => $context['analysis'], 'image_spec' => $spec,
            'metadata' => ['analysis_id' => $context['analysis_id'], 'history' => []],
        ]);
        $this->generate($generation, $context['credential'], $context['image']);

        return $content + ['possui_imagem' => true] + $generation->reviewPayload();
    }

    public function regenerate(?User $user, QuestionImageGeneration $generation, array $content, string $instruction): array
    {
        $credential = $this->credential($user, (int) $generation->tenant_id);
        $content = array_replace($generation->content, $content);
        $generation = DB::transaction(function () use ($generation) {
            $locked = QuestionImageGeneration::query()->lockForUpdate()->findOrFail($generation->id);
            if ($locked->question_id !== null) {
                throw new AiException('Esta geração já foi aprovada. Recrie a questão pelo banco de questões.');
            }
            $locked->update(['status' => 'GENERATING', 'validation' => null, 'error' => null]);

            return $locked;
        });
        try {
            if (QuestionImageSpec::fingerprint($content) !== QuestionImageSpec::fingerprint($generation->content)) {
                $result = $this->router->vision($credential, $this->system(),
                    "Retorne somente um NOVO Image Spec para a questão editada. Não altere o enunciado nem as alternativas.\n"
                    ."A questão editada é a fonte da verdade. Não reutilize medidas antigas nem revele o gabarito.\n"
                    .AiPromptGuard::wrap('questao_editada', json_encode($content, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR))
                    ."\nFormato: ".json_encode(QuestionImageSpec::specFormat(), JSON_UNESCAPED_UNICODE),
                    []);
                $generation->image_spec = QuestionImageSpec::spec($result['data']);
                $metadata = $generation->metadata;
                $metadata['spec_updates'][] = $this->metadata($result);
                $generation->metadata = $metadata;
            }
            $generation->content = $content;
            $generation->save();
            // The new spec is sufficient for regeneration; do not reread a deleted or edited source.
            $this->generate($generation, $credential, null, $instruction);
        } catch (AiException $e) {
            $generation->update(['status' => 'NEEDS_REVIEW', 'error' => $e->getMessage()]);
            $this->log($generation);
            throw $e;
        }

        return $generation->reviewPayload();
    }

    public function assertApproval(QuestionImageGeneration $generation, int $tenantId, array $data): void
    {
        if ((int) $generation->tenant_id !== $tenantId || $generation->question_id !== null
            || $generation->status !== 'READY' || $generation->image_url !== ($data['image_url'] ?? null)
            || ! $generation->disk || ! $generation->path || ! Storage::disk($generation->disk)->exists($generation->path)
            || QuestionImageSpec::fingerprint($generation->content) !== QuestionImageSpec::fingerprint($data)) {
            throw ValidationException::withMessages([
                'generation_id' => 'A imagem não está pronta ou o conteúdo foi alterado. Regenere a imagem antes de aprovar.',
            ]);
        }
    }

    private function generate(QuestionImageGeneration $generation, array $credential, ?string $reference, string $instruction = ''): void
    {
        $started = microtime(true);
        $history = $generation->metadata['history'] ?? [];
        $generation->update(['status' => 'GENERATING', 'error' => null, 'validation' => null]);
        try {
            for ($attempt = 0; $attempt <= config('services.ai.images.max_retries', 2); $attempt++) {
                $attemptStarted = microtime(true);
                $prompt = QuestionImageSpec::generationPrompt($generation->content, $generation->image_spec, $instruction);
                $generation->update([
                    'prompt' => $prompt, 'attempts' => $generation->attempts + 1,
                    'model' => (string) config('services.ai.images.model'),
                ]);
                $result = $this->router->image($credential, $prompt, $reference);
                $file = $this->storage->store((int) $generation->tenant_id, $generation->id, $result['encoded']);
                $generation->fill($file + ['model' => $result['model']])->save();
                $record = $this->metadata($result) + [
                    'prompt' => $prompt, 'path' => $file['path'], 'disk' => $file['disk'],
                    'status' => 'GENERATED', 'created_at' => now()->toIso8601String(),
                ];
                $history[] = $record;
                $generation->update(['metadata' => array_replace($generation->metadata ?? [], ['history' => $history])]);
                $validation = null;
                if (config('services.ai.images.validate', true)) {
                    $checked = $this->router->vision($credential, $this->system(),
                        "Verifique se a imagem corresponde exatamente à NOVA questão e ao Image Spec. Compare todos os números e labels.\n"
                        ."Rejeite se houver valores antigos, informação inventada, gabarito ou explicação na figura.\n"
                        .AiPromptGuard::wrap('questao', json_encode($generation->content, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR))
                        ."\n".AiPromptGuard::wrap('image_spec', json_encode($generation->image_spec, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR))
                        ."\nRetorne JSON: {\"valida\":true,\"confidence\":0.94,\"problemas\":[],\"recomendacao\":null}",
                        [$this->storage->dataUrl($file)]);
                    $validation = QuestionImageSpec::validation($checked['data']);
                    $record['validation_usage'] = $this->metadata($checked);
                    $record['validation'] = $validation;
                }
                $record['status'] = $validation === null ? 'UNVALIDATED'
                    : ($validation['valida'] && $validation['problemas'] === [] ? 'VALIDATED' : 'REJECTED');
                $history[array_key_last($history)] = $record;
                $history[array_key_last($history)]['duration_ms'] = (int) ((microtime(true) - $attemptStarted) * 1000);
                $generation->update([
                    'validation' => $validation,
                    'metadata' => array_replace($generation->metadata ?? [], ['history' => $history]),
                ]);
                if ($validation === null || ($validation['valida'] && $validation['problemas'] === [])) {
                    $generation->update(['status' => 'READY']);

                    return;
                }
                $instruction = "Corrija as inconsistências sem alterar os dados essenciais:\n".implode("\n", $validation['problemas'])
                    ."\n".($validation['recomendacao'] ?? '');
            }
            $generation->update(['status' => 'NEEDS_REVIEW', 'error' => 'A imagem não passou na validação de coerência. Revise os dados e regenere.']);
        } catch (AiException $e) {
            $this->failedAttempt($generation, $history, $e->getMessage());
        } catch (FilesystemException $e) {
            $this->failedAttempt($generation, $history, 'Falha no armazenamento da imagem. Verifique a configuração de uploads.');
        } finally {
            $generation->update(['duration_ms' => (int) ((microtime(true) - $started) * 1000)]);
            $this->log($generation);
        }
    }

    private function failedAttempt(QuestionImageGeneration $generation, array $history, string $error): void
    {
        $history[] = [
            'model' => $generation->model, 'prompt' => $generation->prompt,
            'status' => 'FAILED', 'error' => $error, 'created_at' => now()->toIso8601String(),
        ];
        $generation->update([
            'status' => 'NEEDS_REVIEW', 'error' => $error,
            'metadata' => array_replace($generation->metadata ?? [], ['history' => $history]),
        ]);
    }

    private function credential(?User $user, int $tenantId): array
    {
        return $this->resolver->resolve($user, $tenantId, 'openrouter')
            ?? throw new AiException('Cadastre uma chave ativa do OpenRouter para gerar questões com imagem.', 422, 'ai_not_configured');
    }

    private function system(): string
    {
        return 'Você é especialista em imagens educacionais. Retorne somente JSON válido. '.AiPromptGuard::SYSTEM_RULES;
    }

    private function metadata(array $result): array
    {
        return array_intersect_key($result, array_flip(['model', 'usage', 'id']));
    }

    private function log(QuestionImageGeneration $generation): void
    {
        Log::info('IA: geração de imagem', [
            'question_id' => $generation->source_question_id, 'generation_id' => $generation->id,
            'tenant_id' => $generation->tenant_id, 'model' => $generation->model,
            'image_type' => $generation->image_spec['tipo'] ?? $generation->analysis['tipo'] ?? null,
            'duration_ms' => $generation->duration_ms, 'attempts' => $generation->attempts,
            'status' => $generation->status, 'error' => $generation->error,
            'usage' => $generation->metadata['usage']
                ?? array_map(fn (array $attempt) => $attempt['usage'] ?? [], $generation->metadata['history'] ?? []),
        ]);
    }
}
