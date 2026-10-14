<?php

namespace Tests\Unit;

use App\Contracts\Embeddings\ProvedorEmbeddings;
use App\Contracts\Embeddings\RegistroUsoEmbeddings;
use App\Contracts\Embeddings\RepositorioEmbeddings;
use App\Exceptions\EmbeddingException;
use App\Services\Embeddings\BuscaSemanticaQuestoesService;
use App\Services\Embeddings\ClassificadorSimilaridade;
use App\Services\Embeddings\EmbeddingService;
use App\Services\Embeddings\SemelhancaEstrutural;
use App\Services\Embeddings\SimilaridadeCosseno;
use App\Services\Embeddings\TextoCanonicoQuestao;
use PHPUnit\Framework\TestCase;

class BuscaSemanticaQuestoesTest extends TestCase
{
    public function test_duplicata_exata_ignora_espaco_e_pontuacao(): void
    {
        $texto = new TextoCanonicoQuestao();
        $a = $texto->hash($texto->montar('Quanto é 2 + 2?', ['4', '5'], 'Matemática', ['Adição'], false));
        $b = $texto->hash($texto->montar('Quanto é 2+2 ?', ['4', '5'], 'Matemática', ['Adição'], false));

        $this->assertSame($a, $b);
    }

    public function test_duplicata_semantica_com_palavras_diferentes(): void
    {
        $resultado = $this->busca([1.0, 0.0], [
            $this->candidato(10, 'Um ciclista percorre 30 km em 2 horas. Qual a velocidade média?', [0.96, 0.28]),
        ])->buscarQuestoesSimilares(
            'Um atleta corre 15 km em 1 hora. Qual é a velocidade média?',
            1,
            null,
            10,
            1,
            $this->credencial(),
        );

        $this->assertSame('concluida', $resultado['verificacao']);
        $this->assertSame('possivel_duplicata', $resultado['resultados'][0]['tipo']);
    }

    public function test_mesmo_assunto_com_habilidades_diferentes_nao_bloqueia(): void
    {
        $resultado = $this->busca([1.0, 0.0], [
            $this->candidato(11, 'Represente a fração 3/4 em um desenho de pizza dividido em partes iguais.', [0.0, 1.0]),
        ])->buscarQuestoesSimilares(
            'Calcule 1/2 + 1/4 e simplifique o resultado.',
            1,
            null,
            10,
            1,
            $this->credencial(),
        );

        $this->assertSame([], $resultado['resultados']);
    }

    public function test_troca_de_nome_e_numero_marca_semelhanca_estrutural(): void
    {
        $estrutura = new SemelhancaEstrutural();
        $indice = $estrutura->indice(
            'João comprou 3 maçãs por 10 reais. Quanto custou cada maçã?',
            'Maria comprou 8 maçãs por 15 reais. Quanto custou cada maçã?',
        );

        $this->assertGreaterThanOrEqual(0.9, $indice);
        $classe = (new ClassificadorSimilaridade())->classificar(false, 0.4, $indice, 0.5, false, false);
        $this->assertSame('possivel_duplicata', $classe['tipo']);
    }

    public function test_geracao_sinaliza_item_parecido_com_o_banco(): void
    {
        $analises = $this->busca([1.0, 0.0], [
            $this->candidato(125, 'Um terreno retangular de 8 m por 12 m. Qual a área?', [1.0, 0.0]),
        ])->analisarGeradas(1, $this->credencial(), [
            ['question_text' => 'Calcule a área de um retângulo de 8 m por 12 m.'],
            ['question_text' => 'Uma torneira enche 2 baldes em 6 minutos. Quantos baldes enche em 1 hora?'],
        ], 1, null);

        $this->assertContains($analises[0]['tipo'], ['possivel_duplicata', 'muito_semelhante']);
        $this->assertSame(125, $analises[0]['question_id']);
    }

    public function test_duplicidade_dentro_do_lote(): void
    {
        $analises = $this->busca([1.0, 0.0], [])->analisarGeradas(1, $this->credencial(), [
            ['question_text' => 'Uma padaria vendeu 36 pães de manhã e 15 à tarde. Quantos pães foram vendidos?'],
            ['question_text' => 'Uma padaria vendeu 36 pães de manhã e 15 à tarde. Quantos pães foram vendidos no total?'],
        ], null, null);

        $this->assertTrue($analises[1]['no_lote']);
        $this->assertContains($analises[1]['tipo'], ['possivel_duplicata', 'muito_semelhante', 'duplicata_exata']);
    }

    public function test_modelo_incompativel_pede_reindexacao(): void
    {
        $candidato = $this->candidato(7, 'Outra questão sobre velocidade média em uma estrada longa.', [1.0, 0.0, 0.0]);
        $candidato['model_name'] = 'outro-modelo';
        $candidato['dimensions'] = 3;
        $resultado = $this->busca([1.0, 0.0], [$candidato])->buscarQuestoesSimilares(
            'Qual é a velocidade média de um carro que anda 100 km em 2 horas?',
            null,
            null,
            10,
            1,
            $this->credencial(),
        );

        $this->assertTrue($resultado['reindexacao_necessaria']);
        $this->assertSame('reindexacao_necessaria', $resultado['resultados'][0]['tipo']);
    }

    public function test_falha_do_provedor_nao_aprova_a_verificacao(): void
    {
        $registro = new RegistroEmMemoria();
        $servico = new EmbeddingService(
            new ProvedorQueFalha(),
            new RepositorioEmMemoria([]),
            $registro,
            new TextoCanonicoQuestao(),
        );
        $busca = new BuscaSemanticaQuestoesService(
            new RepositorioEmMemoria([]),
            $servico,
            new TextoCanonicoQuestao(),
            new SimilaridadeCosseno(),
            new SemelhancaEstrutural(),
            new ClassificadorSimilaridade(),
            $registro,
        );

        try {
            $busca->buscarQuestoesSimilares('Quanto é 2 + 2?', null, null, 5, 1, $this->credencial());
            $this->fail('A verificação não pode concluir quando o provedor falha.');
        } catch (EmbeddingException $e) {
            $this->assertSame('embedding_unavailable', $e->codigo);
        }
        $this->assertSame(['falha'], array_column($registro->eventos, 'acao'));
    }

    /** @param  list<float>  $vetorConsulta */
    private function busca(array $vetorConsulta, array $candidatos): BuscaSemanticaQuestoesService
    {
        $registro = new RegistroEmMemoria();

        return new BuscaSemanticaQuestoesService(
            new RepositorioEmMemoria($candidatos),
            new EmbeddingFixo($vetorConsulta),
            new TextoCanonicoQuestao(),
            new SimilaridadeCosseno(),
            new SemelhancaEstrutural(),
            new ClassificadorSimilaridade(),
            $registro,
        );
    }

    /** @param  list<float>  $vetor */
    private function candidato(int $id, string $texto, array $vetor): array
    {
        return [
            'question_id' => $id,
            'question_text' => $texto,
            'options' => [],
            'subject_id' => 1,
            'subject_name' => 'Matemática',
            'topic_names' => ['Cinemática'],
            'image_url' => null,
            'text_hash' => null,
            'embedding' => $vetor,
            'model_name' => 'modelo-teste',
            'dimensions' => count($vetor),
            'strategy_version' => 'V1',
        ];
    }

    /** @return array{provider: string, api_key: string, base_url: string, model: string} */
    private function credencial(): array
    {
        return ['provider' => 'openrouter', 'api_key' => 'teste', 'base_url' => 'http://localhost', 'model' => 'modelo-teste'];
    }
}

class RepositorioEmMemoria implements RepositorioEmbeddings
{
    public function __construct(private array $candidatos) {}

    public function candidatos(int $tenantId, ?int $disciplinaId, ?int $assuntoId, string $modelo, string $estrategia, int $limite): array
    {
        return array_slice($this->candidatos, 0, $limite);
    }

    public function salvar(int $tenantId, int $questaoId, ?int $disciplinaId, string $modelo, int $dimensoes, array $vetor, string $hash, string $estrategia, bool $multimodal): void {}

    public function embeddingDaQuestao(int $questaoId, string $modelo, string $estrategia): ?array
    {
        return null;
    }
}

class RegistroEmMemoria implements RegistroUsoEmbeddings
{
    public array $eventos = [];

    public function registrar(int $tenantId, ?int $questaoId, string $acao, ?string $modelo, int $tokens, float $custo, ?int $duracaoMs, array $meta = []): void
    {
        $this->eventos[] = ['acao' => $acao];
    }

    public function metricas(int $tenantId): array
    {
        return [];
    }
}

class ProvedorQueFalha implements ProvedorEmbeddings
{
    public function gerar(array $credencial, array $textos): array
    {
        throw new EmbeddingException();
    }
}

class EmbeddingFixo extends EmbeddingService
{
    /** @param  list<float>  $vetor */
    public function __construct(private array $vetor)
    {
    }

    public function modelo(): string
    {
        return 'modelo-teste';
    }

    public function dimensoesConfiguradas(): int
    {
        return count($this->vetor);
    }

    public function gerarLote(int $tenantId, array $credencial, array $textos, string $acao = 'gerado'): array
    {
        return array_map(fn (string $texto) => $this->vetorPara($texto), $textos);
    }

    /** @return list<float> */
    private function vetorPara(string $texto): array
    {
        if (str_contains($texto, 'retângulo') || str_contains($texto, 'retangular') || str_contains($texto, 'área')) {
            return [1.0, 0.0];
        }
        if (str_contains($texto, 'padaria')) {
            return [0.0, 1.0];
        }

        return $this->vetor;
    }
}
