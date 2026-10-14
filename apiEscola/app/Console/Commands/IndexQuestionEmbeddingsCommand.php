<?php

namespace App\Console\Commands;

use App\Services\Embeddings\IndexadorEmbeddings;
use Illuminate\Console\Command;

class IndexQuestionEmbeddingsCommand extends Command
{
    protected $signature = 'questions:index-embeddings {--tenant= : ID da escola} {--limit=20 : Questões novas ou desatualizadas neste lote}';

    protected $description = 'Gera embeddings das questões do banco em lote, com retomada e falha isolada';

    public function handle(IndexadorEmbeddings $indexador): int
    {
        $tenantId = $this->option('tenant') !== null && $this->option('tenant') !== '' ? (int) $this->option('tenant') : null;
        $limite = max(1, min(50, (int) $this->option('limit')));
        $resultado = $indexador->processar(null, $tenantId, $limite);
        $this->info("Processadas {$resultado['processadas']}, geradas {$resultado['geradas']}, reutilizadas {$resultado['reutilizadas']}, restantes {$resultado['restantes']}.");
        foreach ($resultado['falhas'] as $falha) {
            $this->warn("#{$falha['question_id']}: {$falha['mensagem']}");
        }

        return self::SUCCESS;
    }
}
