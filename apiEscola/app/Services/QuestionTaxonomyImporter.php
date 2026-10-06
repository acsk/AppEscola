<?php

namespace App\Services;

use App\Models\QuestionBoard;
use App\Models\Subject;
use App\Models\SubjectTopic;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Importa disciplinas, assuntos e bancas de um JSON para um tenant.
 * Idempotente: só cria o que falta, nunca altera nem apaga o que existe.
 * Nomes são comparados sem diferenciar maiúsculas e acentos (collation do MySQL).
 *
 * Formato: {"disciplinas": [{"nome", "aliases"?, "assuntos": [..]}], "bancas": [{"nome", "nome_completo"?, "nome_anterior"?, "ativo"?}]}
 * `aliases`: nomes alternativos de uma disciplina já cadastrada (ex.: "Português" para "Língua Portuguesa").
 */
class QuestionTaxonomyImporter
{
    /** @return array{subjects_created: int, subjects_existing: int, topics_created: int, topics_existing: int, boards_created: int, boards_existing: int, matched: array<string, string>} */
    public function import(int $tenantId, array $data, bool $dryRun = false): array
    {
        $this->validate($data);

        $report = [
            'subjects_created' => 0, 'subjects_existing' => 0,
            'topics_created' => 0, 'topics_existing' => 0,
            'boards_created' => 0, 'boards_existing' => 0,
            'matched' => [],
        ];

        $run = function () use ($tenantId, $data, $dryRun, &$report) {
            foreach ($data['disciplinas'] ?? [] as $item) {
                $name = QuestionCatalogService::normalizeName($item['nome']);
                $subject = $this->findSubject($tenantId, array_merge([$name], $item['aliases'] ?? []));

                if ($subject) {
                    $report['subjects_existing']++;
                    if (mb_strtolower($subject->name) !== mb_strtolower($name)) {
                        $report['matched'][$name] = $subject->name;
                    }
                } else {
                    $report['subjects_created']++;
                    if (! $dryRun) {
                        $subject = Subject::create(['tenant_id' => $tenantId, 'name' => $name, 'status' => 'active']);
                    }
                }

                foreach (array_unique(array_map([QuestionCatalogService::class, 'normalizeName'], $item['assuntos'] ?? [])) as $topicName) {
                    $exists = $subject && SubjectTopic::query()->where('subject_id', $subject->id)->where('name', $topicName)->exists();
                    if ($exists) {
                        $report['topics_existing']++;
                        continue;
                    }
                    $report['topics_created']++;
                    if (! $dryRun) {
                        SubjectTopic::create(['tenant_id' => $tenantId, 'subject_id' => $subject->id, 'name' => $topicName]);
                    }
                }
            }

            foreach ($data['bancas'] ?? [] as $item) {
                $name = QuestionCatalogService::normalizeName($item['nome']);
                if (QuestionBoard::query()->where('tenant_id', $tenantId)->where('name', $name)->exists()) {
                    $report['boards_existing']++;
                    continue;
                }
                $report['boards_created']++;
                if (! $dryRun) {
                    QuestionBoard::create(['tenant_id' => $tenantId, 'name' => $name, 'description' => $this->boardDescription($item)]);
                }
            }
        };

        $dryRun ? $run() : DB::transaction($run);

        return $report;
    }

    private function findSubject(int $tenantId, array $names): ?Subject
    {
        foreach ($names as $name) {
            $subject = Subject::query()->where('tenant_id', $tenantId)->where('name', QuestionCatalogService::normalizeName($name))->first();
            if ($subject) {
                return $subject;
            }
        }

        return null;
    }

    /** Descrição da banca: nome completo, nome anterior e, se inativa, o aviso (bancas não têm campo de status). */
    private function boardDescription(array $item): ?string
    {
        $parts = array_filter([
            $item['nome_completo'] ?? null,
            isset($item['nome_anterior']) ? "Antiga {$item['nome_anterior']}" : null,
            (isset($item['ativo']) && $item['ativo'] === false) ? 'Banca inativa' : null,
        ]);

        return $parts ? implode(' · ', $parts) : null;
    }

    private function validate(array $data): void
    {
        foreach ($data['disciplinas'] ?? [] as $i => $item) {
            if (! is_string($item['nome'] ?? null) || trim($item['nome']) === '' || ! is_array($item['assuntos'] ?? [])) {
                throw new InvalidArgumentException("Disciplina na posição {$i} sem \"nome\" ou com \"assuntos\" inválido.");
            }
        }
        foreach ($data['bancas'] ?? [] as $i => $item) {
            if (! is_string($item['nome'] ?? null) || trim($item['nome']) === '') {
                throw new InvalidArgumentException("Banca na posição {$i} sem \"nome\".");
            }
        }
    }
}
