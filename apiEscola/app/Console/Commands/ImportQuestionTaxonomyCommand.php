<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\QuestionTaxonomyImporter;
use Illuminate\Console\Command;

class ImportQuestionTaxonomyCommand extends Command
{
    protected $signature = 'question-bank:import-taxonomy
        {tenant : ID do tenant}
        {--file= : Caminho do JSON (padrão: database/seeders/data/question_taxonomy.json)}
        {--dry-run : Mostra o que seria criado, sem gravar}';

    protected $description = 'Importa disciplinas, assuntos e bancas do banco de questões para um tenant (só cria o que falta)';

    public function handle(QuestionTaxonomyImporter $importer): int
    {
        $tenant = Tenant::find((int) $this->argument('tenant'));
        if (! $tenant) {
            $this->error('Tenant não encontrado.');

            return self::FAILURE;
        }

        $path = $this->option('file') ?: database_path('seeders/data/question_taxonomy.json');
        $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (! is_array($data)) {
            $this->error("Arquivo inválido ou não encontrado: {$path}");

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $report = $importer->import($tenant->id, $data, $dryRun);

        $this->info(($dryRun ? '[simulação] ' : '')."Tenant #{$tenant->id} {$tenant->name}");
        $this->table(['', 'Criados', 'Já existiam'], [
            ['Disciplinas', $report['subjects_created'], $report['subjects_existing']],
            ['Assuntos', $report['topics_created'], $report['topics_existing']],
            ['Bancas', $report['boards_created'], $report['boards_existing']],
        ]);
        foreach ($report['matched'] as $from => $to) {
            $this->line("  \"{$from}\" → disciplina existente \"{$to}\"");
        }

        return self::SUCCESS;
    }
}
