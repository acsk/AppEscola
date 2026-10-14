<?php

namespace App\Services\Embeddings;

/**
 * Os limiares são heurísticas iniciais. 0,95 não significa 95% de chance de ser duplicata.
 */
class ClassificadorSimilaridade
{
    public function __construct(
        private readonly float $duplicata = 0.95,
        private readonly float $muitoSemelhante = 0.85,
        private readonly float $relacionada = 0.70,
    ) {}

    public static function fromConfig(): self
    {
        return new self(
            (float) config('services.ai.embeddings.thresholds.duplicata', 0.95),
            (float) config('services.ai.embeddings.thresholds.muito_semelhante', 0.85),
            (float) config('services.ai.embeddings.thresholds.relacionada', 0.70),
        );
    }

    /**
     * @return array{tipo: string, motivo: string}
     */
    public function classificar(
        bool $hashIgual,
        ?float $cosseno,
        float $estrutural,
        float $textual,
        bool $imagemEssencial,
        bool $vetorIncompativel,
    ): array {
        if ($vetorIncompativel) {
            return [
                'tipo' => 'reindexacao_necessaria',
                'motivo' => 'O embedding armazenado usa outro modelo ou outra dimensão. A comparação semântica foi ignorada.',
            ];
        }
        if ($hashIgual) {
            return [
                'tipo' => 'duplicata_exata',
                'motivo' => 'O texto normalizado é o mesmo, mesmo com diferença de espaço ou pontuação.',
            ];
        }
        if ($imagemEssencial) {
            return [
                'tipo' => 'comparacao_multimodal_necessaria',
                'motivo' => 'A imagem é essencial para a resolução. O embedding textual não basta para decidir duplicidade.',
            ];
        }

        $duplicata = $this->duplicata;
        $alta = $this->muitoSemelhante;
        $relacionada = $this->relacionada;

        if (($cosseno !== null && $cosseno >= $duplicata) || $estrutural >= 0.9) {
            return [
                'tipo' => 'possivel_duplicata',
                'motivo' => $estrutural >= 0.9
                    ? 'A estrutura da questão é a mesma, com troca superficial de nomes ou números.'
                    : 'A similaridade semântica passou do limiar de possível duplicata. Confira antes de cadastrar.',
            ];
        }
        if (($cosseno !== null && $cosseno >= $alta) || $estrutural >= 0.75 || $textual >= 0.8) {
            return [
                'tipo' => 'muito_semelhante',
                'motivo' => 'As questões compartilham situação, dados ou procedimento. Não são automaticamente a mesma questão.',
            ];
        }
        if ($cosseno !== null && $cosseno >= $relacionada) {
            return [
                'tipo' => 'mesmo_assunto',
                'motivo' => 'As questões se relacionam pelo assunto. A habilidade cobrada pode ser outra.',
            ];
        }

        return [
            'tipo' => 'sem_correspondencia_relevante',
            'motivo' => 'Nenhuma correspondência passou dos limiares configurados.',
        ];
    }
}
