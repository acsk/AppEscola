<?php

namespace App\Services\Embeddings;

use App\Support\QuestionRichText;

/**
 * Texto usado no embedding. Não inclui gabarito nem resolução.
 * A versão da estratégia muda quando a composição do texto muda.
 */
class TextoCanonicoQuestao
{
    public function __construct(private readonly string $versao = 'V1') {}

    public static function fromConfig(): self
    {
        return new self((string) config('services.ai.embeddings.strategy', 'V1'));
    }

    public function estrategia(): string
    {
        return $this->versao;
    }

    /**
     * @param  list<string>  $alternativas
     * @param  list<string>  $assuntos
     */
    public function montar(string $enunciado, array $alternativas, ?string $disciplina, array $assuntos, bool $imagemEssencial): string
    {
        $linhas = array_filter([
            $disciplina ? 'Disciplina: '.$this->limpo($disciplina) : null,
            $assuntos !== [] ? 'Assuntos: '.$this->limpo(implode(', ', $assuntos)) : null,
            'Enunciado: '.$this->limpo($enunciado),
            $alternativas !== []
                ? 'Alternativas: '.$this->limpo(implode(' | ', $alternativas))
                : null,
            $imagemEssencial ? 'Imagem: essencial para a resolução' : null,
        ]);

        return implode("\n", $linhas);
    }

    public function normalizar(string $texto): string
    {
        $texto = QuestionRichText::plain($texto);
        $texto = mb_strtolower($texto);
        $texto = preg_replace('/\s+/u', ' ', $texto) ?? $texto;
        $texto = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $texto) ?? $texto;

        return trim(preg_replace('/\s+/u', ' ', $texto) ?? $texto);
    }

    public function hash(string $textoCanonico): string
    {
        return hash('sha256', $this->normalizar($textoCanonico));
    }

    public function imagemEssencial(?string $imageUrl, string $enunciado): bool
    {
        if (trim((string) $imageUrl) === '') {
            return false;
        }

        return (bool) preg_match(
            '/\b(gr[aá]fico|figura|imagem|ilustra[çc][ãa]o|charge|tirinha|mapa|tabela|diagrama)s?\b/iu',
            QuestionRichText::plain($enunciado)
        ) || mb_strlen($this->normalizar($enunciado)) < 40;
    }

    private function limpo(string $texto): string
    {
        return trim(preg_replace('/\s+/u', ' ', QuestionRichText::plain($texto)) ?? $texto);
    }
}
