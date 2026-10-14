<?php

namespace App\Services\Embeddings;

use App\Contracts\Embeddings\RepositorioEmbeddings;
use App\Exceptions\EmbeddingException;
use App\Models\ExamQuestion;
use App\Models\User;
use App\Services\Ai\AiCredentialResolver;

/** Indexa em lotes. Cada falha fica registrada e o restante continua. */
class IndexadorEmbeddings
{
    public function __construct(
        private readonly EmbeddingService $embeddings,
        private readonly TextoCanonicoQuestao $texto,
        private readonly RepositorioEmbeddings $repositorio,
        private readonly AiCredentialResolver $credenciais,
    ) {}

    /** @return array{processadas: int, geradas: int, reutilizadas: int, falhas: list<array{question_id: int, mensagem: string}>, restantes: int} */
    public function processar(?User $user, ?int $tenantId, int $limite): array
    {
        $limite = max(1, min(50, $limite));
        $geradas = 0;
        $reutilizadas = 0;
        $falhas = [];
        $processadas = 0;
        $vistas = 0;
        $teto = $limite * 20;

        $consulta = ExamQuestion::query()
            ->with(['subject:id,name', 'topics:id,name', 'options:id,question_id,option_text,order'])
            ->when($tenantId, fn ($q) => $q->inQuestionBank($tenantId))
            ->orderBy('id');

        $consulta->chunkById(30, function ($lote) use ($user, $limite, $teto, &$processadas, &$geradas, &$reutilizadas, &$falhas, &$vistas) {
            foreach ($lote as $questao) {
                if ($processadas >= $limite || $vistas >= $teto) {
                    return false;
                }
                $vistas++;
                $credencial = $this->credenciais->resolve($user, (int) $questao->tenant_id);
                if ($credencial === null) {
                    $falhas[] = ['question_id' => (int) $questao->id, 'mensagem' => 'Sem chave de IA para esta escola.'];
                    continue;
                }
                $imagem = $this->texto->imagemEssencial($questao->image_url, (string) $questao->question_text);
                $canonico = $this->texto->montar(
                    (string) $questao->question_text,
                    $questao->options->sortBy('order')->pluck('option_text')->map(fn ($t) => (string) $t)->all(),
                    $questao->subject?->name,
                    $questao->topics->pluck('name')->map(fn ($n) => (string) $n)->all(),
                    $imagem,
                );
                $hash = $this->texto->hash($canonico);
                $guardado = $this->repositorio->embeddingDaQuestao((int) $questao->id, $this->embeddings->modelo(), $this->texto->estrategia());
                if ($guardado !== null && $guardado['text_hash'] === $hash) {
                    $reutilizadas++;
                    continue;
                }
                $processadas++;
                try {
                    $this->embeddings->vetorDaQuestao(
                        (int) $questao->tenant_id,
                        (int) $questao->id,
                        $questao->subject_id ? (int) $questao->subject_id : null,
                        $canonico,
                        $imagem,
                        $credencial,
                    );
                    $geradas++;
                } catch (EmbeddingException $e) {
                    $falhas[] = ['question_id' => (int) $questao->id, 'mensagem' => $e->getMessage()];
                }
            }

            return $processadas < $limite && $vistas < $teto;
        });

        $restantes = ExamQuestion::query()
            ->when($tenantId, fn ($q) => $q->inQuestionBank($tenantId))
            ->whereDoesntHave('embeddings', fn ($q) => $q
                ->where('model_name', $this->embeddings->modelo())
                ->where('strategy_version', $this->texto->estrategia()))
            ->count();

        return compact('processadas', 'geradas', 'reutilizadas', 'falhas') + ['restantes' => $restantes];
    }
}
