<?php

namespace App\Services\Embeddings;

use App\Contracts\Embeddings\RegistroUsoEmbeddings;
use App\Contracts\Embeddings\RepositorioEmbeddings;
use App\Support\AiPromptGuard;

class BuscaSemanticaQuestoesService
{
    public const INSTRUCAO_ORIGINALIDADE = <<<'TXT'
Você receberá questões existentes que servem como referências pedagógicas e exemplos de conteúdos já abordados.

Sua tarefa é produzir novas questões que avaliem as habilidades solicitadas, mas apresentem variação significativa em relação aos exemplos.

Evite reproduzir:
- Enunciados existentes.
- Mesmos personagens e situações.
- Sequências numéricas idênticas.
- Mesma estrutura com simples substituição de nomes.
- Alternativas excessivamente semelhantes.
- Contextos repetidos sem necessidade.

Sempre que pedagogicamente adequado, varie:
- Contexto da situação-problema.
- Caminho de raciocínio.
- Representação matemática.
- Forma de apresentação.
- Dados e unidades.
- Complexidade cognitiva.

Não altere o conteúdo curricular ou a dificuldade solicitada apenas para parecer diferente.

Cada questão deve ter exatamente uma alternativa correta, resolução verificável e distratores plausíveis.

Não considere uma questão original apenas porque os nomes ou números foram modificados.
TXT;

    public function __construct(
        private readonly RepositorioEmbeddings $repositorio,
        private readonly EmbeddingService $embeddings,
        private readonly TextoCanonicoQuestao $texto,
        private readonly SimilaridadeCosseno $cosseno,
        private readonly SemelhancaEstrutural $estrutura,
        private readonly ClassificadorSimilaridade $classificador,
        private readonly RegistroUsoEmbeddings $usos,
    ) {}

    /**
     * @param  list<string>  $alternativas
     * @param  list<string>  $assuntos
     * @param  array{provider: string, api_key: string, base_url: string, model: string}  $credencial
     * @param  list<int>  $ignorarIds
     * @return array{verificacao: string, resultados: list<array<string, mixed>>}
     */
    public function buscarQuestoesSimilares(
        string $texto,
        ?int $disciplinaId,
        ?int $assuntoId,
        int $limite,
        int $tenantId,
        array $credencial,
        array $alternativas = [],
        ?string $disciplina = null,
        array $assuntos = [],
        ?string $imageUrl = null,
        array $ignorarIds = [],
    ): array {
        $inicio = microtime(true);
        $limite = max(1, min(20, $limite));
        $imagem = $this->texto->imagemEssencial($imageUrl, $texto);
        $canonico = $this->texto->montar($texto, $alternativas, $disciplina, $assuntos, $imagem);
        $hash = $this->texto->hash($canonico);
        $candidatos = $this->repositorio->candidatos(
            $tenantId,
            $disciplinaId,
            $assuntoId,
            $this->embeddings->modelo(),
            $this->texto->estrategia(),
            $this->limiteCandidatos(),
        );

        $vetorConsulta = null;
        $reindexar = false;
        if (! $imagem) {
            $vetorConsulta = $this->embeddings->gerarLote($tenantId, $credencial, [$canonico], 'gerado')[0];
        }

        $resultados = [];
        foreach ($candidatos as $candidato) {
            if (in_array($candidato['question_id'], $ignorarIds, true)) {
                continue;
            }
            $canonicoCandidato = $this->texto->montar(
                $candidato['question_text'],
                $candidato['options'],
                $candidato['subject_name'],
                $candidato['topic_names'],
                $this->texto->imagemEssencial($candidato['image_url'], $candidato['question_text']),
            );
            $hashIgual = $this->texto->hash($canonicoCandidato) === $hash
                || ($candidato['text_hash'] !== null && $candidato['text_hash'] === $hash);
            $incompativel = $candidato['model_name'] !== null && (
                $candidato['model_name'] !== $this->embeddings->modelo()
                || (int) $candidato['dimensions'] !== $this->embeddings->dimensoesConfiguradas()
                || $candidato['strategy_version'] !== $this->texto->estrategia()
            );
            if ($incompativel) {
                $reindexar = true;
            }
            $semantica = (! $incompativel && $vetorConsulta !== null && is_array($candidato['embedding']))
                ? $this->cosseno->calcular($vetorConsulta, $candidato['embedding'])
                : null;
            $estrutural = $this->estrutura->indice($canonico, $canonicoCandidato);
            $textual = $this->estrutura->textual($texto, $candidato['question_text']);
            $classe = $this->classificador->classificar(
                $hashIgual,
                $semantica,
                $estrutural,
                $textual,
                $imagem && $this->texto->imagemEssencial($candidato['image_url'], $candidato['question_text']),
                $incompativel && ! $hashIgual,
            );
            if ($classe['tipo'] === 'sem_correspondencia_relevante') {
                continue;
            }
            $resultados[] = [
                'question_id' => $candidato['question_id'],
                'enunciado' => mb_substr(trim($candidato['question_text']), 0, 280),
                'disciplina' => $candidato['subject_name'],
                'assuntos' => $candidato['topic_names'],
                'similaridade_semantica' => $semantica === null ? null : round($semantica, 4),
                'correspondencia_textual' => round($textual, 4),
                'semelhanca_estrutural' => round($estrutural, 4),
                'tipo' => $classe['tipo'],
                'motivo' => $classe['motivo'],
            ];
        }

        usort($resultados, function (array $a, array $b) {
            $ordem = ['duplicata_exata' => 0, 'possivel_duplicata' => 1, 'muito_semelhante' => 2, 'comparacao_multimodal_necessaria' => 3, 'reindexacao_necessaria' => 4, 'mesmo_assunto' => 5];

            return ($ordem[$a['tipo']] ?? 9) <=> ($ordem[$b['tipo']] ?? 9)
                ?: (($b['similaridade_semantica'] ?? $b['semelhanca_estrutural']) <=> ($a['similaridade_semantica'] ?? $a['semelhanca_estrutural']));
        });
        $resultados = array_slice($resultados, 0, $limite);
        $duplicatas = count(array_filter($resultados, fn ($r) => in_array($r['tipo'], ['duplicata_exata', 'possivel_duplicata', 'muito_semelhante'], true)));
        if ($duplicatas > 0) {
            $this->usos->registrar($tenantId, null, 'duplicata', $this->embeddings->modelo(), 0, 0, null, ['quantidade' => $duplicatas]);
        }
        $this->usos->registrar($tenantId, null, 'busca', $this->embeddings->modelo(), 0, 0, (int) round((microtime(true) - $inicio) * 1000), [
            'resultados' => count($resultados),
        ]);

        return [
            'verificacao' => 'concluida',
            'reindexacao_necessaria' => $reindexar,
            'comparacao_multimodal_necessaria' => $imagem,
            'resultados' => $resultados,
        ];
    }

    /**
     * Exemplos curtos e diferentes entre si, para o prompt não repetir o banco.
     *
     * @return list<array{question_id: int, question_text: string}>
     */
    public function exemplosDiversos(int $tenantId, ?int $disciplinaId, ?int $assuntoId, int $quantidade): array
    {
        $candidatos = $this->repositorio->candidatos(
            $tenantId,
            $disciplinaId,
            $assuntoId,
            $this->embeddings->modelo(),
            $this->texto->estrategia(),
            40,
        );
        $escolhidos = [];
        foreach ($candidatos as $candidato) {
            $perto = false;
            foreach ($escolhidos as $escolhido) {
                if ($this->estrutura->indice($candidato['question_text'], $escolhido['question_text']) >= 0.72) {
                    $perto = true;
                    break;
                }
            }
            if ($perto) {
                continue;
            }
            $escolhidos[] = [
                'question_id' => $candidato['question_id'],
                'question_text' => mb_substr(trim($candidato['question_text']), 0, 400),
            ];
            if (count($escolhidos) >= $quantidade) {
                break;
            }
        }

        return $escolhidos;
    }

    /**
     * Compara questões recém-geradas com o banco e entre si.
     *
     * @param  list<array{question_text: string, options?: list<array{option_text?: string}>}>  $questoes
     * @param  array{provider: string, api_key: string, base_url: string, model: string}  $credencial
     * @return list<array{tipo: string, motivo: string, question_id: int|null, no_lote: bool}>
     */
    public function analisarGeradas(int $tenantId, array $credencial, array $questoes, ?int $disciplinaId, ?int $assuntoId): array
    {
        $canonicos = [];
        foreach ($questoes as $questao) {
            $alternativas = array_map(
                fn ($o) => (string) ($o['option_text'] ?? ''),
                (array) ($questao['options'] ?? [])
            );
            $canonicos[] = $this->texto->montar((string) ($questao['question_text'] ?? ''), $alternativas, null, [], false);
        }
        $vetores = $this->embeddings->gerarLote($tenantId, $credencial, $canonicos, 'gerado');
        $candidatos = $this->repositorio->candidatos(
            $tenantId,
            $disciplinaId,
            $assuntoId,
            $this->embeddings->modelo(),
            $this->texto->estrategia(),
            $this->limiteCandidatos(),
        );
        $analises = [];
        foreach ($questoes as $i => $questao) {
            $pior = ['tipo' => 'sem_correspondencia_relevante', 'motivo' => 'Nenhuma correspondência passou dos limiares configurados.', 'question_id' => null, 'no_lote' => false];
            foreach ($candidatos as $candidato) {
                $semantica = is_array($candidato['embedding'])
                    ? $this->cosseno->calcular($vetores[$i], $candidato['embedding'])
                    : null;
                $estrutural = $this->estrutura->indice($canonicos[$i], $candidato['question_text']);
                $classe = $this->classificador->classificar(false, $semantica, $estrutural, 0, false, false);
                if ($this->gravidade($classe['tipo']) < $this->gravidade($pior['tipo'])) {
                    $pior = ['tipo' => $classe['tipo'], 'motivo' => $classe['motivo'], 'question_id' => $candidato['question_id'], 'no_lote' => false];
                }
            }
            foreach ($questoes as $j => $outra) {
                if ($j >= $i) {
                    continue;
                }
                $semantica = $this->cosseno->calcular($vetores[$i], $vetores[$j]);
                $estrutural = $this->estrutura->indice($canonicos[$i], $canonicos[$j]);
                $classe = $this->classificador->classificar(false, $semantica, $estrutural, 0, false, false);
                if ($this->gravidade($classe['tipo']) < $this->gravidade($pior['tipo'])) {
                    $pior = [
                        'tipo' => $classe['tipo'],
                        'motivo' => 'No mesmo lote, a questão se parece com outra gerada agora. '.$classe['motivo'],
                        'question_id' => null,
                        'no_lote' => true,
                    ];
                }
            }
            $analises[] = $pior;
        }

        return $analises;
    }

    private function limiteCandidatos(): int
    {
        try {
            return function_exists('app') && app()->bound('config')
                ? (int) config('services.ai.embeddings.candidate_limit', 200)
                : 200;
        } catch (\Throwable) {
            return 200;
        }
    }

    private function gravidade(string $tipo): int
    {
        return match ($tipo) {
            'duplicata_exata', 'possivel_duplicata' => 0,
            'muito_semelhante' => 1,
            'mesmo_assunto' => 3,
            default => 4,
        };
    }

    /** @param  list<array{question_id: int, question_text: string}>  $exemplos */
    public function blocoDeExemplos(array $exemplos): ?string
    {
        if ($exemplos === []) {
            return null;
        }
        $linhas = [];
        foreach ($exemplos as $exemplo) {
            $linhas[] = '#'.$exemplo['question_id'].' '.$exemplo['question_text'];
        }

        return self::INSTRUCAO_ORIGINALIDADE."\n\nQUESTÕES JÁ CADASTRADAS (referência; não copie):\n"
            .AiPromptGuard::wrap('banco', implode("\n", $linhas));
    }
}
