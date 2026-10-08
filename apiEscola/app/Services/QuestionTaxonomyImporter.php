<?php

namespace App\Services;

use App\Models\QuestionBoard;
use App\Models\Subject;
use App\Models\SubjectTopic;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
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

    /** Taxonomia padrão do sistema (database/seeders/data/question_taxonomy.json). */
    public function defaultData(): array
    {
        return (array) json_decode((string) file_get_contents(database_path('seeders/data/question_taxonomy.json')), true);
    }

    /** @return array<int, array{name: string, topics: array<int, string>}> */
    public function defaultSubjects(array $data): array
    {
        return array_map(fn (array $item) => [
            'name'   => QuestionCatalogService::normalizeName($item['nome']),
            'topics' => array_values(array_unique(array_map([QuestionCatalogService::class, 'normalizeName'], $item['assuntos'] ?? []))),
        ], $data['disciplinas'] ?? []);
    }

    /**
     * Disciplina padrão que corresponde a uma disciplina da escola com nome próprio
     * ("PORTUGUÊS CPM" → Língua Portuguesa, "MATEMÁTICA CPM" → Matemática). Vence o nome/alias mais longo contido.
     */
    public function suggestSource(array $data, string $subjectName): ?string
    {
        $haystack = ' '.self::fold($subjectName).' ';
        $best = null;
        $bestLength = 0;
        foreach ($data['disciplinas'] ?? [] as $item) {
            foreach (array_merge([$item['nome']], $item['aliases'] ?? []) as $name) {
                $needle = self::fold($name);
                if ($needle !== '' && str_contains($haystack, " {$needle} ") && mb_strlen($needle) > $bestLength) {
                    $best = QuestionCatalogService::normalizeName($item['nome']);
                    $bestLength = mb_strlen($needle);
                }
            }
        }

        return $best;
    }

    /**
     * Copia os assuntos de uma disciplina padrão para uma disciplina existente da escola.
     * Idempotente: só cria os assuntos que faltam.
     *
     * @return array{topics_created: int, topics_existing: int}
     */
    public function importTopics(Subject $subject, array $data, string $source): array
    {
        $item = collect($this->defaultSubjects($data))->first(fn (array $s) => self::fold($s['name']) === self::fold($source));
        if ($item === null) {
            throw new InvalidArgumentException("Disciplina padrão \"{$source}\" não encontrada.");
        }

        $report = ['topics_created' => 0, 'topics_existing' => 0];
        DB::transaction(function () use ($subject, $item, &$report) {
            foreach ($item['topics'] as $topicName) {
                if (SubjectTopic::query()->where('subject_id', $subject->id)->where('name', $topicName)->exists()) {
                    $report['topics_existing']++;
                    continue;
                }
                SubjectTopic::create(['tenant_id' => $subject->tenant_id, 'subject_id' => $subject->id, 'name' => $topicName]);
                $report['topics_created']++;
            }
        });

        return $report;
    }

    private static function fold(string $value): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', ' ', mb_strtolower(Str::ascii($value))) ?? '');
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
