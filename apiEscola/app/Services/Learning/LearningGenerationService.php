<?php

namespace App\Services\Learning;

use App\Models\ExamQuestion;
use App\Models\ExamQuestionOption;
use App\Models\QuestionDifficulty;
use App\Models\QuestionGenerationJob;
use App\Models\SubjectTopic;
use App\Services\Ai\AiChatClient;
use App\Services\Ai\AiCredentialResolver;
use App\Services\Ai\ExplanationLetterAligner;
use App\Services\Ai\QuestionGabaritoGuard;
use App\Services\Ai\ValidadorQuestaoService;
use App\Models\QuestionReview;
use Illuminate\Support\Str;

/**
 * Gera um lote compartilhado por assunto. Só o cron chama a IA.
 * Questão inválida ou parecida demais fica no job para revisão humana e não é publicada.
 */
class LearningGenerationService
{
    public function __construct(
        private readonly AiCredentialResolver $credentials,
        private readonly AiChatClient $chat,
        private readonly ValidadorQuestaoService $validador,
    ) {}

    public function enqueue(int $tenantId, int $subjectId, int $topicId): ?QuestionGenerationJob
    {
        $open = QuestionGenerationJob::query()
            ->where('tenant_id', $tenantId)
            ->where('subject_topic_id', $topicId)
            ->whereIn('status', [QuestionGenerationJob::PENDING, QuestionGenerationJob::RUNNING])
            ->first();
        if ($open) {
            return $open;
        }

        return QuestionGenerationJob::query()->create([
            'tenant_id' => $tenantId,
            'subject_id' => $subjectId,
            'subject_topic_id' => $topicId,
            'status' => QuestionGenerationJob::PENDING,
            'batch_size' => max(5, min(10, (int) config('learning.generation_batch', 8))),
        ]);
    }

    public function runPending(int $limit = 2): int
    {
        $done = 0;
        $jobs = QuestionGenerationJob::query()
            ->where('status', QuestionGenerationJob::PENDING)
            ->orderBy('id')
            ->limit($limit)
            ->get();
        foreach ($jobs as $job) {
            $claimed = QuestionGenerationJob::query()
                ->whereKey($job->id)
                ->where('status', QuestionGenerationJob::PENDING)
                ->update([
                    'status' => QuestionGenerationJob::RUNNING,
                    'locked_at' => now(),
                ]);
            if ($claimed !== 1) {
                continue;
            }
            $this->process($job->fresh());
            $done++;
        }

        return $done;
    }

    public function process(QuestionGenerationJob $job): void
    {
        try {
            $credential = $this->credentials->resolve(null, $job->tenant_id, 'openrouter');
            $topic = SubjectTopic::query()->with('subject:id,name')->find($job->subject_topic_id);
            if (! $credential || ! $topic) {
                $this->finish($job, QuestionGenerationJob::FAILED, 'Sem chave de IA da escola ou assunto removido.');

                return;
            }
            [$system, $user] = $this->prompt($topic, $job->batch_size);
            $result = $this->chat->jsonWithMetadata($credential, $system, $user, 0.4);
            $created = 0;
            $rejected = [];
            foreach ($result['data']['questions'] ?? [] as $payload) {
                if (! is_array($payload)) {
                    $rejected[] = ['reason' => 'formato', 'payload' => $payload];
                    continue;
                }
                if (is_array($payload['options'] ?? null)) {
                    $payload['explanation'] = ExplanationLetterAligner::align(
                        (string) ($payload['explanation'] ?? ''),
                        $payload['options']
                    );
                }
                $reason = $this->rejectReason($payload, $topic);
                if ($reason) {
                    $rejected[] = ['reason' => $reason, 'payload' => $payload];
                    continue;
                }
                $payload['subject_name'] = $topic->subject?->name;
                $payload['topic_names'] = [$topic->name];
                $review = $this->validador->validarECorrigir($credential, $this->reviewPayload($payload), [
                    'tenant_id' => $job->tenant_id,
                    'persist' => true,
                ]);
                if (($review['result'] ?? '') !== QuestionReview::APROVADA) {
                    $rejected[] = [
                        'reason' => 'revisao pedagogica',
                        'payload' => $payload,
                        'review' => $review,
                    ];
                    continue;
                }
                $saved = $this->publish($job, $topic, $review['question'] ?? $payload);
                if (! empty($review['review_ids'])) {
                    QuestionReview::query()->whereIn('id', $review['review_ids'])->update(['question_id' => $saved->id]);
                }
                $created++;
            }
            $usage = $result['usage'] ?? [];
            $job->forceFill([
                'status' => QuestionGenerationJob::DONE,
                'created_count' => $created,
                'rejected_count' => count($rejected),
                'rejected' => $rejected === [] ? null : $rejected,
                'prompt_tokens' => (int) ($usage['prompt_tokens'] ?? 0),
                'completion_tokens' => (int) ($usage['completion_tokens'] ?? 0),
                'finished_at' => now(),
                'error' => null,
            ])->save();
        } catch (\Throwable $e) {
            $this->finish($job, QuestionGenerationJob::FAILED, Str::limit($e->getMessage(), 500));
        }
    }

    /** @param  array<string, mixed>  $payload */
    public function rejectReason(array $payload, SubjectTopic $topic): ?string
    {
        $text = trim((string) ($payload['question_text'] ?? ''));
        $explanation = trim((string) ($payload['explanation'] ?? ''));
        if (QuestionGabaritoGuard::admitsBrokenQuestion($explanation)) {
            return 'explicação contradiz o gabarito';
        }
        $options = is_array($payload['options'] ?? null) ? array_values($payload['options']) : [];
        if (mb_strlen($text) < 20 || mb_strlen($explanation) < 10) {
            return 'enunciado ou explicação incompletos';
        }
        if (count($options) < 2 || count($options) > 5) {
            return 'quantidade de alternativas';
        }
        $correct = 0;
        foreach ($options as $option) {
            $label = trim((string) (is_array($option) ? ($option['text'] ?? '') : ''));
            if ($label === '') {
                return 'alternativa vazia';
            }
            if (is_array($option) && ! empty($option['is_correct'])) {
                $correct++;
            }
        }
        if ($correct !== 1) {
            return 'gabarito';
        }
        if (QuestionGabaritoGuard::stressMismatch($text, $explanation, $options) !== null) {
            return 'tonicidade incorreta';
        }
        if (! $this->difficultyId($payload['difficulty'] ?? null)) {
            return 'dificuldade';
        }
        if ($this->tooSimilar($topic, $text)) {
            return 'parecida com questão já existente';
        }

        return null;
    }

    /** @param  array<string, mixed>  $payload */
    private function reviewPayload(array $payload): array
    {
        $options = [];
        foreach ((array) ($payload['options'] ?? []) as $option) {
            if (! is_array($option)) {
                continue;
            }
            $options[] = [
                'option_text' => (string) ($option['option_text'] ?? $option['text'] ?? ''),
                'is_correct' => ! empty($option['is_correct']),
            ];
        }
        $payload['options'] = $options;

        return $payload;
    }

    /** @param  array<string, mixed>  $payload */
    private function publish(QuestionGenerationJob $job, SubjectTopic $topic, array $payload): ExamQuestion
    {
        $question = ExamQuestion::query()->create([
            'tenant_id' => $job->tenant_id,
            'subject_id' => $topic->subject_id,
            'difficulty_id' => $this->difficultyId($payload['difficulty'] ?? null),
            'type' => 'multiple_choice',
            'question_text' => trim((string) $payload['question_text']),
            'explanation' => trim((string) $payload['explanation']),
            'source_exam_name' => 'Reforço adaptativo',
            'points' => 1,
            'order' => 1,
            'is_annulled' => false,
            'is_outdated' => false,
        ]);
        $question->topics()->sync([$topic->id]);
        foreach (array_values($payload['options']) as $index => $option) {
            ExamQuestionOption::query()->create([
                'question_id' => $question->id,
                'option_text' => trim((string) ($option['text'] ?? $option['option_text'] ?? '')),
                'is_correct' => ! empty($option['is_correct']),
                'order' => $index + 1,
            ]);
        }

        return $question;
    }

    private function difficultyId(mixed $name): ?int
    {
        $needle = Str::ascii(mb_strtolower(trim((string) $name)));
        $rows = QuestionDifficulty::query()->orderBy('sort_order')->get();
        foreach ($rows as $row) {
            if (Str::ascii(mb_strtolower($row->name)) === $needle) {
                return $row->id;
            }
        }
        $index = match (true) {
            str_contains($needle, 'facil') => 0,
            str_contains($needle, 'dificil') => $rows->count() - 1,
            str_contains($needle, 'medi') => (int) floor(max($rows->count() - 1, 0) / 2),
            default => null,
        };
        if ($index === null || $rows->isEmpty() || $index < 0) {
            return null;
        }

        return $rows->values()->get($index)?->id;
    }

    private function tooSimilar(SubjectTopic $topic, string $text): bool
    {
        $normalized = $this->normalize($text);
        if (ExamQuestion::query()
            ->whereHas('topics', fn ($q) => $q->where('subject_topics.id', $topic->id))
            ->where('question_text', $text)
            ->exists()) {
            return true;
        }
        $existing = ExamQuestion::query()
            ->whereHas('topics', fn ($q) => $q->where('subject_topics.id', $topic->id))
            ->latest('id')
            ->limit(200)
            ->pluck('question_text');
        foreach ($existing as $current) {
            $other = $this->normalize((string) $current);
            if ($other === $normalized) {
                return true;
            }
            similar_text($normalized, $other, $percent);
            if ($percent >= 85) {
                return true;
            }
        }

        return false;
    }

    private function normalize(string $text): string
    {
        $text = mb_strtolower(strip_tags($text));
        $text = preg_replace('/\s+/', ' ', $text) ?? $text;

        return trim($text);
    }

    /** @return array{0: string, 1: string} */
    private function prompt(SubjectTopic $topic, int $batch): array
    {
        $subject = $topic->subject?->name ?? 'a disciplina';

        return [
            'Você cria questões de concurso em JSON válido, sem texto fora do JSON.',
            "Crie {$batch} questões inéditas de múltipla escolha sobre {$topic->name}, da disciplina {$subject}. "
                .'Formato: {"questions":[{"question_text":"...","explanation":"...","difficulty":"Fácil|Média|Difícil","options":[{"text":"...","is_correct":true}]}]} '
                .'Cada questão tem de 2 a 5 alternativas e exatamente uma correta. Enunciado e explicação em português. '
                .QuestionGabaritoGuard::AUTHORING_RULE,
        ];
    }

    private function finish(QuestionGenerationJob $job, string $status, string $error): void
    {
        $job->forceFill([
            'status' => $status,
            'error' => $error,
            'finished_at' => now(),
        ])->save();
    }
}
