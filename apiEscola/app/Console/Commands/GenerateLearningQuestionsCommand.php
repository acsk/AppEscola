<?php

namespace App\Console\Commands;

use App\Services\Learning\LearningGenerationService;
use Illuminate\Console\Command;

/** Processa poucos lotes por vez. A tela do aluno nunca espera a IA. */
class GenerateLearningQuestionsCommand extends Command
{
    protected $signature = 'learning:generate {--limit=2 : Lotes por execução}';

    protected $description = 'Gera questões de reforço em lote, só para assuntos sem conteúdo disponível';

    public function handle(LearningGenerationService $generation): int
    {
        $done = $generation->runPending(max(1, (int) $this->option('limit')));
        $this->info("Lotes processados: {$done}.");

        return self::SUCCESS;
    }
}
