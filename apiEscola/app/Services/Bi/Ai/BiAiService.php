<?php

namespace App\Services\Bi\Ai;

use App\Exceptions\AiException;
use App\Models\User;
use App\Services\Ai\AiChatClient;
use App\Services\Ai\AiCredentialResolver;
use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\BiFilters;
use App\Services\Bi\ClassAnalyticsService;
use App\Services\Bi\Diagnosis\StudentDiagnosisService;
use App\Services\Bi\EngagementService;
use App\Services\Bi\Interventions\InterventionService;
use App\Services\Bi\OverviewService;
use App\Services\Bi\Reports\BiReportService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Rascunhos de texto com IA a partir dos números já calculados pelo BI.
 * Privacidade: os fatos enviados nunca têm nome, CPF ou id de aluno (nomes de turma, disciplina e assunto sim).
 * Governança: cada trecho cita as chaves de evidência; números que não batem com os fatos são sinalizados;
 * o texto só vai para documento depois de validado por uma pessoa.
 */
class BiAiService
{
    public const DIAGNOSIS = 'diagnosis';

    public const REPORT_SUMMARY = 'report_summary';

    public const SCHOOL_INSIGHTS = 'school_insights';

    public const KINDS = [self::DIAGNOSIS, self::REPORT_SUMMARY, self::SCHOOL_INSIGHTS];

    /** Área do insight → tela do painel com o detalhe. */
    public const AREAS = ['geral', 'avaliacoes', 'disciplinas', 'turmas', 'engajamento', 'intervencoes'];

    private const RULES = <<<'TXT'
Você é um coordenador pedagógico experiente escrevendo para a equipe de um cursinho preparatório.
Regras obrigatórias:
- Escreva em português do Brasil, frases curtas, tom profissional e respeitoso.
- Use SOMENTE os fatos do JSON fornecido. Não invente números, causas, nomes ou eventos.
- Todo número citado deve vir dos fatos (pode arredondar para inteiro). Não calcule indicadores novos.
- Cite em "evidence" as chaves exatas dos fatos que sustentam cada trecho.
- Não identifique pessoas: refira-se ao estudante como "o aluno" ou "a turma".
- Não rotule de forma permanente nem faça diagnóstico clínico ou psicológico; descreva o que os dados mostram no período.
- Quando um dado for nulo ou faltar amostra, diga que não há dados suficientes em vez de supor.
- Responda apenas com o JSON pedido.
TXT;

    public function __construct(
        private readonly AiCredentialResolver $credentials,
        private readonly AiChatClient $client,
        private readonly BiFeatureGate $gate,
        private readonly StudentDiagnosisService $diagnosis,
        private readonly BiReportService $reports,
        private readonly OverviewService $overview,
        private readonly ClassAnalyticsService $classes,
        private readonly EngagementService $engagement,
        private readonly InterventionService $interventions,
    ) {
    }

    /** @return array{enabled: bool, available: bool, reason: string|null} */
    public function status(?User $user, int $tenantId): array
    {
        $settings = $this->gate->settings($tenantId);
        $available = $this->credentials->resolve($user, $tenantId) !== null;
        $plan = $this->gate->allows($settings, BiFeatureGate::PLAN_ADVANCED);

        return [
            'enabled' => $settings['ai_enabled'] && $available && $plan,
            'available' => $available && $plan,
            'reason' => ! $plan ? 'plan' : (! $available ? 'no_key' : (! $settings['ai_enabled'] ? 'disabled' : null)),
        ];
    }

    /** @return array<string, mixed> o rascunho salvo */
    public function generate(BiAccessScope $scope, User $user, BiFilters $filters, string $kind, array $target): array
    {
        $credential = $this->credentials->resolve($user, $scope->tenantId) ?? throw AiException::notConfigured();

        [$targetKey, $facts] = match ($kind) {
            self::DIAGNOSIS => ['student:'.$target['student_id'], $this->diagnosisFacts($scope, $filters, (int) $target['student_id'])],
            self::REPORT_SUMMARY => ['report:'.$target['report'], $this->reportFacts($scope, $filters, $target['report'])],
            self::SCHOOL_INSIGHTS => ['school', $this->schoolFacts($scope, $filters)],
        };

        $response = $this->client->json($credential, self::RULES, $this->prompt($kind, $facts), 0.3);
        $content = $this->sanitize($kind, $response, $facts);
        $unverified = $this->unverifiedNumbers($content, $facts);

        $id = DB::table('bi_ai_drafts')->insertGetId([
            'tenant_id' => $scope->tenantId,
            'kind' => $kind,
            'target_key' => $targetKey,
            'period_from' => $filters->from->toDateString(),
            'period_to' => $filters->to->toDateString(),
            'filters' => json_encode($filters->toArray()),
            'content' => json_encode($content),
            'facts' => json_encode($facts),
            'unverified' => json_encode($unverified),
            'model' => $credential['model'] ?? null,
            'status' => 'draft',
            'generated_by' => $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->find($scope->tenantId, $id);
    }

    /** @return array<string, mixed>|null */
    public function latest(int $tenantId, string $kind, string $targetKey): ?array
    {
        $id = DB::table('bi_ai_drafts')
            ->where('tenant_id', $tenantId)->where('kind', $kind)->where('target_key', $targetKey)
            ->where('status', '!=', 'discarded')
            ->orderByDesc('id')
            ->value('id');

        return $id ? $this->find($tenantId, (int) $id) : null;
    }

    /** @return array<string, mixed>|null */
    public function find(int $tenantId, int $id): ?array
    {
        $row = DB::table('bi_ai_drafts as d')
            ->leftJoin('users as g', 'g.id', '=', 'd.generated_by')
            ->leftJoin('users as v', 'v.id', '=', 'd.validated_by')
            ->where('d.tenant_id', $tenantId)
            ->where('d.id', $id)
            ->first(['d.*', 'g.name as generated_by_name', 'v.name as validated_by_name']);

        return $row ? [
            'id' => (int) $row->id,
            'kind' => $row->kind,
            'target_key' => $row->target_key,
            'period' => ['from' => $row->period_from, 'to' => $row->period_to],
            'content' => json_decode($row->content, true),
            'facts' => json_decode($row->facts, true),
            'unverified' => json_decode((string) $row->unverified, true) ?? [],
            'edited_text' => $row->edited_text,
            'model' => $row->model,
            'status' => $row->status,
            'generated_by' => $row->generated_by_name,
            'validated_by' => $row->validated_by_name,
            'validated_at' => $row->validated_at,
            'created_at' => $row->created_at,
        ] : null;
    }

    public function update(int $tenantId, int $id, array $changes, ?int $userId): void
    {
        $data = ['updated_at' => now()];
        if (array_key_exists('text', $changes)) {
            // Editar volta para rascunho: o texto mudou e precisa de nova validação.
            $data += ['edited_text' => $changes['text'], 'status' => 'draft', 'validated_by' => null, 'validated_at' => null];
        }
        if (($changes['status'] ?? null) === 'validated') {
            $data += ['status' => 'validated', 'validated_by' => $userId, 'validated_at' => now()];
        }
        if (($changes['status'] ?? null) === 'discarded') {
            $data += ['status' => 'discarded'];
        }
        DB::table('bi_ai_drafts')->where('tenant_id', $tenantId)->where('id', $id)->update($data);
    }

    // ── Fatos (sem identificação de aluno) ───────────────────────────────────────

    /** @return array<string, mixed> */
    private function diagnosisFacts(BiAccessScope $scope, BiFilters $filters, int $studentId): array
    {
        $class = $this->diagnosis->referenceClass($scope, $filters, $studentId);
        $d = $this->diagnosis->build($scope, $filters, $studentId, $class);
        $facts = [
            'periodo' => $d['meta']['period']['from'].' a '.$d['meta']['period']['to'],
            'meta_pct' => $d['meta']['goal_pct'],
            'concurso_alvo' => $d['meta']['exam_type']['label'] ?? null,
            'turma' => $d['student']['school_class']['name'],
            'avaliacoes_no_periodo' => $d['student']['assessments'],
            'questoes_respondidas' => $d['student']['questions'],
            'dias_ativos_semana' => $d['student']['active_days_per_week'],
        ];
        $labels = ['learning' => 'aprendizagem', 'engagement' => 'engajamento', 'preparation' => 'preparacao'];
        foreach ($labels as $key => $label) {
            $dim = $d['dimensions'][$key];
            $facts["{$label}.idx"] = $dim['value'];
            $facts["{$label}.turma"] = $dim['class_avg'];
            $facts["{$label}.variacao_pts"] = $dim['delta'];
            foreach ($dim['components'] as $c) {
                $facts["{$label}.{$c['key']}"] = $c['value'];
            }
        }
        foreach ($d['domain'] as $subject) {
            foreach ($subject['topics'] as $t) {
                if ($t['value'] !== null) {
                    $facts['assunto.'.Str::slug($t['name'], '_').'_pct'] = $t['value'];
                }
            }
        }
        if ($d['highlight']) {
            $facts['disciplina_mais_fraca'] = $d['highlight']['subject'];
            $facts['disciplina_mais_fraca_pct'] = $d['highlight']['accuracy'];
        }
        $facts['motivos_atencao'] = array_column($d['student']['reasons'], 'label');
        $facts['recomendacoes_por_regra'] = array_column($d['recommendations'], 'title');

        return $facts;
    }

    /** @return array<string, mixed> */
    private function reportFacts(BiAccessScope $scope, BiFilters $filters, string $report): array
    {
        if ($report === BiReportService::RESULTS) {
            $r = $this->reports->results($scope, $filters);
            $facts = ['periodo' => $r['period']['from'].' a '.$r['period']['to'], 'alunos_ativos' => $r['sample']['active_students'], 'alunos_com_evolucao_comparavel' => $r['sample']['students_with_evolution']];
            foreach ($r['headline'] as $k => $v) {
                $facts["resultado.{$k}"] = $v;
            }
            foreach ($r['subjects'] as $s) {
                if (! $s['suppressed']) {
                    $facts['disciplina.'.Str::slug($s['name'], '_').'.variacao_pp'] = $s['delta_pp'];
                }
            }
            $facts['aprovacoes_comprovadas'] = $r['approvals']['total'];

            return $facts;
        }

        return $this->schoolFacts($scope, $filters);
    }

    /** @return array<string, mixed> */
    private function schoolFacts(BiAccessScope $scope, BiFilters $filters): array
    {
        $o = $this->overview->build($scope, $filters);
        $facts = ['periodo' => $o['meta']['period']['from'].' a '.$o['meta']['period']['to'], 'meta_pct' => $o['meta']['goal_pct']];
        foreach ($o['metrics'] as $m) {
            $facts[$m['key']] = $m['value'];
            $facts[$m['key'].'.variacao'] = $m['delta'];
        }
        foreach ($o['subjects_difficulty'] as $s) {
            $facts['disciplina.'.Str::slug($s['name'], '_').'.acerto_pct'] = $s['accuracy'];
        }
        $min = BiReportService::minGroup();
        foreach ($this->classes->compare($scope, $filters)['items'] as $c) {
            if (($c['metrics']['students']['value'] ?? 0) < $min) {
                continue; // turma pequena fica fora (LGPD)
            }
            $slug = 'turma.'.Str::slug($c['name'], '_');
            $facts["{$slug}.media_online"] = $c['metrics']['avg_online']['value'];
            $facts["{$slug}.frequencia"] = $c['metrics']['attendance']['value'];
            $facts["{$slug}.em_atencao"] = $c['metrics']['needs_support']['value'];
        }
        if ($this->gate->allows($this->gate->settings($scope->tenantId), BiFeatureGate::PLAN_ADVANCED)) {
            foreach ($this->engagement->build($scope, $filters)['metrics'] as $m) {
                $facts['engajamento.'.$m['key']] = $m['value'];
            }
            foreach ($this->interventions->effectiveness($scope, $filters)['items'] as $i) {
                $facts['intervencao.'.$i['type'].'.variacao_pp'] = $i['delta_pp'];
            }
        }

        return $facts;
    }

    // ── Prompt e validação da resposta ───────────────────────────────────────────

    private function prompt(string $kind, array $facts): string
    {
        $shape = match ($kind) {
            self::DIAGNOSIS => 'Escreva o diagnóstico pedagógico do aluno em 2 a 3 parágrafos (o que vai bem, onde está a dificuldade e o que priorizar). Formato: {"paragraphs":[{"text":"...","evidence":["chave"]}]}',
            self::REPORT_SUMMARY => 'Escreva o resumo executivo do relatório em 2 a 3 parágrafos para a direção da escola. Formato: {"paragraphs":[{"text":"...","evidence":["chave"]}]}',
            self::SCHOOL_INSIGHTS => 'Liste de 3 a 6 observações relevantes para a coordenação (pontos de atenção e destaques). Cada uma com área entre '.implode(', ', self::AREAS).'. Formato: {"insights":[{"title":"...","text":"...","area":"...","evidence":["chave"]}]}',
        };

        return $shape."\n\nFatos (JSON):\n".json_encode($facts, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    }

    /** Mantém só o formato esperado e evidências que existem nos fatos. */
    private function sanitize(string $kind, array $response, array $facts): array
    {
        $keep = fn ($evidence) => array_values(array_filter((array) $evidence, fn ($k) => is_string($k) && array_key_exists($k, $facts)));

        if ($kind === self::SCHOOL_INSIGHTS) {
            $items = collect($response['insights'] ?? [])
                ->filter(fn ($i) => is_array($i) && trim((string) ($i['text'] ?? '')) !== '')
                ->take(8)
                ->map(fn ($i) => [
                    'title' => Str::limit(trim((string) ($i['title'] ?? 'Observação')), 120),
                    'text' => Str::limit(trim((string) $i['text']), 800),
                    'area' => in_array($i['area'] ?? null, self::AREAS, true) ? $i['area'] : 'geral',
                    'evidence' => $keep($i['evidence'] ?? []),
                ])
                ->values()
                ->all();
            if ($items === []) {
                throw AiException::invalidResponse('as observações');
            }

            return ['insights' => $items];
        }

        $paragraphs = collect($response['paragraphs'] ?? [])
            ->filter(fn ($p) => is_array($p) && trim((string) ($p['text'] ?? '')) !== '')
            ->take(5)
            ->map(fn ($p) => ['text' => Str::limit(trim((string) $p['text']), 1200), 'evidence' => $keep($p['evidence'] ?? [])])
            ->values()
            ->all();
        if ($paragraphs === []) {
            throw AiException::invalidResponse('o texto');
        }

        return ['paragraphs' => $paragraphs];
    }

    /**
     * Números do texto que não aparecem nos fatos (com tolerância de arredondamento).
     *
     * @return list<string>
     */
    private function unverifiedNumbers(array $content, array $facts): array
    {
        $known = [];
        array_walk_recursive($facts, function ($v) use (&$known) {
            if (is_int($v) || is_float($v)) {
                $known[] = (float) $v;
                $known[] = abs((float) $v);
            } elseif (is_string($v) && preg_match_all('/\d+(?:[.,]\d+)?/', $v, $inText)) {
                // Datas e nomes com números ("2026-09-01", "CPM 2026") também são fatos.
                foreach ($inText[0] as $n) {
                    $known[] = (float) str_replace(',', '.', $n);
                }
            }
        });
        $texts = array_map(fn ($i) => ($i['title'] ?? '').' '.$i['text'], $content['insights'] ?? $content['paragraphs']);
        preg_match_all('/\d+(?:[.,]\d+)?/', implode(' ', $texts), $m);

        return collect($m[0])
            ->map(fn ($n) => ['raw' => $n, 'value' => (float) str_replace(',', '.', $n)])
            ->reject(fn ($n) => $n['value'] <= 1 || collect($known)->contains(fn ($k) => abs($k - $n['value']) <= 0.6))
            ->pluck('raw')
            ->unique()
            ->values()
            ->all();
    }
}
