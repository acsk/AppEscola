<?php

namespace App\Services;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Histórico diário da posição nos rankings de desempenho (Wilson) e dedicação.
 *
 * A seta compara a posição ao vivo com o fechamento do dia anterior no mesmo
 * critério, período e escopo (disciplina e assunto). Períodos e filtros diferentes
 * não se misturam. O ranking não tem filtro de turma; o escopo é o que a tela já filtra.
 *
 * Quem não está nesse fechamento fica sem posição anterior (não usa posição 0) e o
 * status é "new". Subiu, caiu ou ficou é só a mudança de lugar, não de pontuação.
 * O desempate é o mesmo da lista ao vivo (pontuação e, por último, o id do aluno).
 *
 * A foto das 10 em 10 minutos continua só na participação da tela inicial.
 * Aqui a retenção é de 90 dias.
 */
class PracticeRankingHistoryService
{
    public const RETENTION_DAYS = 90;

    public const STATUS_UP = 'up';

    public const STATUS_DOWN = 'down';

    public const STATUS_SAME = 'same';

    public const STATUS_NEW = 'new';

    /** Escopo canônico. "all" é o ranking sem disciplina nem assunto. */
    public static function scopeKey(?int $subjectId, ?int $topicId): string
    {
        if (! $subjectId && ! $topicId) {
            return 'all';
        }

        return 's'.($subjectId ?? 0).'-t'.($topicId ?? 0);
    }

    /**
     * Garante o fechamento de ontem para este escopo. A leitura do ranking não grava de novo se ele já existe.
     * Respostas de hoje não entram nessa foto.
     */
    public function ensureClosedDay(
        PracticePerformanceService $performance,
        int $tenantId,
        string $criterion,
        string $period,
        ?int $subjectId,
        ?int $topicId,
    ): void {
        $yesterday = now(PracticePerformanceService::RANKING_TIMEZONE)->subDay()->toDateString();
        if ($this->hasDay($tenantId, $criterion, $period, $subjectId, $topicId, $yesterday)) {
            return;
        }

        $lock = 'ranking-daily:'.$tenantId.':'.$criterion.':'.$period.':'.self::scopeKey($subjectId, $topicId).':'.$yesterday;
        try {
            Cache::lock($lock, 120)->block(10, function () use ($performance, $tenantId, $criterion, $period, $subjectId, $topicId, $yesterday) {
                if ($this->hasDay($tenantId, $criterion, $period, $subjectId, $topicId, $yesterday)) {
                    return;
                }
                $before = now(PracticePerformanceService::RANKING_TIMEZONE)->startOfDay()->utc();
                $rows = $performance->captureScoredRows($tenantId, $period, $criterion, $subjectId, $topicId, $before);
                $this->store($tenantId, $criterion, $period, $subjectId, $topicId, $yesterday, $rows, now());
            });
        } catch (LockTimeoutException) {
            // Outra requisição está gravando o mesmo fechamento. A seta segue com o que já houver.
        }
    }

    /**
     * @param  list<array{student_id: int, position: int, score: float|int}>  $rows
     */
    public function store(
        int $tenantId,
        string $criterion,
        string $period,
        ?int $subjectId,
        ?int $topicId,
        string $referenceOn,
        array $rows,
        Carbon $capturedAt,
    ): void {
        DB::transaction(function () use ($tenantId, $criterion, $period, $subjectId, $topicId, $referenceOn, $rows, $capturedAt) {
            $existingId = DB::table('practice_ranking_snapshot_days')
                ->where('tenant_id', $tenantId)
                ->where('criterion', $criterion)
                ->where('period', $period)
                ->where('scope_key', self::scopeKey($subjectId, $topicId))
                ->where('reference_on', $referenceOn)
                ->value('id');
            if ($existingId) {
                DB::table('practice_ranking_snapshot_positions')->where('snapshot_day_id', $existingId)->delete();
                DB::table('practice_ranking_snapshot_days')->where('id', $existingId)->delete();
            }

            $dayId = DB::table('practice_ranking_snapshot_days')->insertGetId([
                'tenant_id' => $tenantId,
                'criterion' => $criterion,
                'period' => $period,
                'scope_key' => self::scopeKey($subjectId, $topicId),
                'subject_id' => $subjectId,
                'topic_id' => $topicId,
                'reference_on' => $referenceOn,
                'captured_at' => $capturedAt,
                'participants' => count($rows),
            ]);

            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('practice_ranking_snapshot_positions')->insert(array_map(fn (array $row) => [
                    'snapshot_day_id' => $dayId,
                    'student_id' => $row['student_id'],
                    'position' => $row['position'],
                    'score' => $row['score'],
                ], $chunk));
            }
        });
    }

    /**
     * Fechamento mais recente antes de hoje, no mesmo critério, período e escopo.
     *
     * @return array{reference_at: string, positions: array<int, int>}|null
     */
    public function baseline(int $tenantId, string $criterion, string $period, ?int $subjectId, ?int $topicId): ?array
    {
        $today = now(PracticePerformanceService::RANKING_TIMEZONE)->toDateString();
        $day = DB::table('practice_ranking_snapshot_days')
            ->where('tenant_id', $tenantId)
            ->where('criterion', $criterion)
            ->where('period', $period)
            ->where('scope_key', self::scopeKey($subjectId, $topicId))
            ->where('reference_on', '<', $today)
            ->orderByDesc('reference_on')
            ->first();
        if (! $day) {
            return null;
        }

        $positions = [];
        foreach (DB::table('practice_ranking_snapshot_positions')->where('snapshot_day_id', $day->id)->get(['student_id', 'position']) as $row) {
            $positions[(int) $row->student_id] = (int) $row->position;
        }

        return [
            'reference_at' => Carbon::parse($day->reference_on, PracticePerformanceService::RANKING_TIMEZONE)->startOfDay()->utc()->toIso8601String(),
            'positions' => $positions,
        ];
    }

    /**
     * @param  array{reference_at: string, positions: array<int, int>}|null  $baseline
     * @return array{previous_position: ?int, movement: ?int, movement_status: string, movement_reference_at: ?string}
     */
    public function movementFor(int $position, int $studentId, ?array $baseline): array
    {
        if ($baseline === null || ! array_key_exists($studentId, $baseline['positions'])) {
            return [
                'previous_position' => null,
                'movement' => null,
                'movement_status' => self::STATUS_NEW,
                'movement_reference_at' => $baseline['reference_at'] ?? null,
            ];
        }

        $previous = $baseline['positions'][$studentId];
        $movement = $previous - $position;

        return [
            'previous_position' => $previous,
            'movement' => $movement,
            'movement_status' => $movement > 0 ? self::STATUS_UP : ($movement < 0 ? self::STATUS_DOWN : self::STATUS_SAME),
            'movement_reference_at' => $baseline['reference_at'],
        ];
    }

    /** Escopos já fechados algum dia (além do geral), para o job diário continuar o histórico filtrado. */
    public function knownScopes(int $tenantId, string $criterion, string $period): array
    {
        return DB::table('practice_ranking_snapshot_days')
            ->where('tenant_id', $tenantId)
            ->where('criterion', $criterion)
            ->where('period', $period)
            ->where('scope_key', '!=', 'all')
            ->distinct()
            ->get(['subject_id', 'topic_id'])
            ->map(fn ($row) => ['subject_id' => $row->subject_id ? (int) $row->subject_id : null, 'topic_id' => $row->topic_id ? (int) $row->topic_id : null])
            ->all();
    }

    public function prune(): int
    {
        $cut = now(PracticePerformanceService::RANKING_TIMEZONE)->subDays(self::RETENTION_DAYS)->toDateString();
        $ids = DB::table('practice_ranking_snapshot_days')->where('reference_on', '<', $cut)->pluck('id');
        if ($ids->isEmpty()) {
            return 0;
        }
        DB::table('practice_ranking_snapshot_positions')->whereIn('snapshot_day_id', $ids)->delete();

        return DB::table('practice_ranking_snapshot_days')->whereIn('id', $ids)->delete();
    }

    private function hasDay(int $tenantId, string $criterion, string $period, ?int $subjectId, ?int $topicId, string $referenceOn): bool
    {
        return DB::table('practice_ranking_snapshot_days')
            ->where('tenant_id', $tenantId)
            ->where('criterion', $criterion)
            ->where('period', $period)
            ->where('scope_key', self::scopeKey($subjectId, $topicId))
            ->where('reference_on', $referenceOn)
            ->exists();
    }
}
