<?php

namespace Tests\Unit;

use App\Services\PracticePerformanceService;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Fórmula e desempate do ranking de desempenho. Não consulta o banco. */
class WilsonScoreTest extends TestCase
{
    #[DataProvider('amostras')]
    public function test_wilson_score_matches_the_lower_bound(int $acertos, int $total, float $pontuacao): void
    {
        $this->assertSame($pontuacao, PracticePerformanceService::wilsonScore($acertos, $total));
    }

    public static function amostras(): array
    {
        return [
            'sem respostas' => [0, 0, 0.0],
            '85 de 100' => [85, 100, 76.7],
            '40 de 50' => [40, 50, 67.0],
            '9 de 10' => [9, 10, 59.6],
            '16 de 20' => [16, 20, 58.4],
            // 29,96 arredonda para 30,0 (a fórmula pede o limite inferior, não o truncamento).
            '32 de 80' => [32, 80, 30.0],
            'nenhum acerto' => [0, 1, 0.0],
        ];
    }

    public function test_ties_break_by_correct_answers_then_volume_then_student_id(): void
    {
        $melhorAcerto = ['score' => 50.0, 'correct' => 10, 'questions' => 20, 'id' => 9];
        $maisQuestoes = ['score' => 50.0, 'correct' => 10, 'questions' => 12, 'id' => 1];
        $idMenor = ['score' => 50.0, 'correct' => 8, 'questions' => 12, 'id' => 2];
        $idMaior = ['score' => 50.0, 'correct' => 8, 'questions' => 12, 'id' => 7];
        $pontuacaoMaior = ['score' => 60.0, 'correct' => 1, 'questions' => 2, 'id' => 99];

        $linhas = [$idMaior, $maisQuestoes, $idMenor, $melhorAcerto, $pontuacaoMaior];
        usort($linhas, [PracticePerformanceService::class, 'compareWilson']);

        $this->assertSame([99, 9, 1, 2, 7], array_column($linhas, 'id'));
    }

    public function test_dedication_score_uses_configurable_weights_and_tie_breaks(): void
    {
        $this->assertSame(6, PracticePerformanceService::dedicationScore(1, 1, 1, 5));
        $this->assertSame(11, PracticePerformanceService::dedicationScore(1, 2, 1, 5));

        $maisDias = ['score' => 11, 'active_days' => 2, 'questions' => 1, 'id' => 8];
        $maisQuestoes = ['score' => 11, 'active_days' => 1, 'questions' => 6, 'id' => 2];
        $linhas = [$maisQuestoes, $maisDias];
        usort($linhas, [PracticePerformanceService::class, 'compareDedication']);

        $this->assertSame([8, 2], array_column($linhas, 'id'));
    }
}
