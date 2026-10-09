<?php

namespace App\Services;

use App\Models\PracticeAnswer;
use App\Models\Student;
use App\Models\Subject;
use App\Models\SubjectTopic;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Desempenho de prática do aluno (disciplina → assunto, com o que estudar) e rankings do banco.
 * Participação: quem respondeu mais questões diferentes. Desempenho: Wilson Score (95%).
 * Só usa respostas "contadas" (avulsas e de simulados finalizados).
 */
class PracticePerformanceService
{
    /** Abaixo disso o nível é "poucos dados": a taxa de acerto ainda não diz muito. */
    public const MIN_SAMPLE = 5;

    public const LEVEL_NOT_STARTED = 'not_started';
    public const LEVEL_FEW_DATA = 'few_data';
    public const LEVEL_WEAK = 'weak';
    public const LEVEL_ATTENTION = 'attention';
    public const LEVEL_GOOD = 'good';

    /**
     * week = semana corrente (segunda 00:00 até agora); last_week = semana anterior fechada.
     * 7d = últimos 7 dias; month = últimos 30 dias; all = geral.
     */
    public const PERIODS = ['week', 'last_week', '7d', 'month', 'all'];

    public const CRITERION_PARTICIPATION = 'participation';

    public const CRITERION_WILSON = 'wilson';

    public const CRITERION_DEDICATION = 'dedication';

    /** @var list<string> */
    public const SCORED_CRITERIA = [self::CRITERION_WILSON, self::CRITERION_DEDICATION];

    /** A semana do ranking vira na segunda 00:00 do horário escolar, não em UTC. */
    public const RANKING_TIMEZONE = 'America/Sao_Paulo';

    private const FOCUS_LIMIT = 5;

    public function __construct(
        private readonly PracticeService $practice,
        private readonly StudentEnrollmentService $enrollments,
    ) {}

    public function performance(Student $student): array
    {
        $answers = fn () => PracticeAnswer::query()->counted()
            ->where('practice_answers.student_id', $student->id)
            ->join('exam_questions as eq', 'eq.id', '=', 'practice_answers.exam_question_id');

        $bySubject = $answers()
            ->select('eq.subject_id', ...$this->scoreColumns())
            ->groupBy('eq.subject_id')->get()
            ->keyBy(fn ($row) => (int) $row->subject_id);
        $byTopic = $answers()
            ->leftJoin('exam_question_topic as eqt', 'eqt.exam_question_id', '=', 'eq.id')
            ->select('eq.subject_id', 'eqt.subject_topic_id as topic_id', ...$this->scoreColumns())
            ->groupBy('eq.subject_id', 'eqt.subject_topic_id')->get()
            ->groupBy(fn ($row) => (int) $row->subject_id);
        $available = collect($this->practice->filters($student)['subjects'])->keyBy('id');

        $subjectIds = $bySubject->keys()->merge($available->keys())->unique();
        $subjectNames = Subject::query()->whereIn('id', $subjectIds->filter())->pluck('name', 'id');
        $topicNames = SubjectTopic::query()
            ->whereIn('id', $byTopic->flatten(1)->pluck('topic_id')->filter()->unique())
            ->pluck('name', 'id');

        $subjects = $subjectIds->map(function (int $subjectId) use ($bySubject, $byTopic, $available, $subjectNames, $topicNames) {
            $offer = $available->get($subjectId);
            $topicOffer = collect($offer['topics'] ?? [])->keyBy('id');
            $answeredTopics = ($byTopic->get($subjectId) ?? collect())->keyBy(fn ($row) => (int) $row->topic_id);

            $topics = $answeredTopics->keys()->merge($topicOffer->keys())->unique()
                ->map(fn (int $topicId) => [
                    'id'        => $topicId ?: null,
                    'name'      => $topicId ? ($topicNames[$topicId] ?? $topicOffer->get($topicId)['name'] ?? 'Assunto') : 'Sem assunto',
                    'available' => (int) ($topicOffer->get($topicId)['total'] ?? 0),
                ] + $this->score($answeredTopics->get($topicId)))
                ->sort(fn (array $a, array $b) => $this->compareByPriority($a, $b))
                ->values();

            return [
                'id'        => $subjectId ?: null,
                'name'      => $subjectId ? ($subjectNames[$subjectId] ?? 'Disciplina') : 'Sem disciplina',
                'available' => (int) ($offer['total'] ?? 0),
                'topics'    => $topics,
            ] + $this->score($bySubject->get($subjectId));
        })
            ->filter(fn (array $s) => $s['answered'] > 0 || $s['available'] > 0)
            ->sort(fn (array $a, array $b) => $this->compareByPriority($a, $b))
            ->values();

        $overall = $answers()->select(...$this->scoreColumns())->first();

        return [
            'min_sample'  => self::MIN_SAMPLE,
            'overall'     => $this->score($overall),
            'study_focus' => $this->studyFocus($subjects),
            'subjects'    => $subjects,
        ];
    }

    /**
     * Limite inferior do intervalo de Wilson (z = 1,96, 95%), em pontos de 0 a 100 com 1 casa.
     * Poucas respostas certas ficam abaixo de uma amostra maior com aproveitamento parecido.
     */
    public static function wilsonScore(int $acertos, int $total): float
    {
        if ($total <= 0) {
            return 0.0;
        }

        $z = 1.96;
        $p = $acertos / $total;
        $z2 = $z * $z;
        $centro = ($p * (1 - $p) + $z2 / (4 * $total)) / $total;
        $score = ($p + $z2 / (2 * $total) - $z * sqrt(max(0, $centro))) / (1 + $z2 / $total);

        return round($score * 100, 1);
    }

    /**
     * Maior pontuação primeiro. Empate: mais acertos, depois mais questões, depois o id do aluno.
     *
     * @param  array{score: float|int, correct: int, questions: int, id: int}  $a
     * @param  array{score: float|int, correct: int, questions: int, id: int}  $b
     */
    public static function compareWilson(array $a, array $b): int
    {
        return [$b['score'], $b['correct'], $b['questions'], $a['id']]
            <=> [$a['score'], $a['correct'], $a['questions'], $b['id']];
    }

    /** Dedicação: mais pontos, depois mais dias ativos, depois mais questões inéditas, depois o id. */
    public static function compareDedication(array $a, array $b): int
    {
        return [$b['score'], $b['active_days'], $b['questions'], $a['id']]
            <=> [$a['score'], $a['active_days'], $a['questions'], $b['id']];
    }

    /** (questões inéditas × peso) + (dias ativos × peso). Os pesos ficam em config/practice.php. */
    public static function dedicationScore(int $questions, int $activeDays, ?int $questionWeight = null, ?int $dayWeight = null): int
    {
        $questionWeight ??= (int) config('practice.dedication_question_weight', 1);
        $dayWeight ??= (int) config('practice.dedication_day_weight', 5);

        return ($questions * $questionWeight) + ($activeDays * $dayWeight);
    }

    /**
     * Ranking do período. Sem critério, é participação (questões diferentes; empate pelos acertos;
     * posições iguais ficam 1, 2, 2, 4). Com criterion=wilson, ordena pela pontuação de Wilson.
     *
     * @param  array{criterion?: string, subject_id?: ?int, topic_id?: ?int, page?: int, course_id?: ?int}  $filters
     */
    public function ranking(int $tenantId, string $period, int $limit, ?int $viewerStudentId = null, bool $fullNames = false, array $filters = []): array
    {
        $criterion = $filters['criterion'] ?? self::CRITERION_PARTICIPATION;
        $courseId = (int) ($filters['course_id'] ?? 0);
        if ($courseId <= 0) {
            return $this->emptyRanking($period, $criterion, $limit, $filters);
        }
        if (in_array($criterion, self::SCORED_CRITERIA, true)) {
            return $this->scoredRanking($tenantId, $period, $limit, $viewerStudentId, $fullNames, $filters, $criterion);
        }

        [$since, $until] = $this->periodRange($period);
        $rows = $this->rankingRows($tenantId, $since, $until, $courseId);
        $previousPositions = $this->previousPositions($tenantId, $period, self::CRITERION_PARTICIPATION, $courseId);

        $position = 0;
        $previous = null;
        $ranked = $rows->values()->map(function ($row, int $index) use (&$position, &$previous, $previousPositions, $viewerStudentId, $fullNames) {
            $key = $row->questions.'|'.$row->correct;
            if ($key !== $previous) {
                $position = $index + 1;
                $previous = $key;
            }
            $before = $previousPositions[(int) $row->id] ?? null;

            return [
                'position'  => $position,
                // Positivo = subiu em relação à foto de cerca de 24h atrás; negativo = caiu; null = entrou depois dessa foto.
                'movement'  => $before === null ? null : $before - $position,
                'name'      => $fullNames ? $row->name : $this->shortName($row->name),
                'photo_url' => $row->photo_url,
                'questions' => (int) $row->questions,
                'is_me'     => $viewerStudentId !== null && (int) $row->id === $viewerStudentId,
            ] + $this->score($row) + ($fullNames ? [
                'student_id'        => (int) $row->id,
                'enrollment_number' => $row->enrollment_number,
            ] : []);
        });

        return [
            'period'       => $period,
            'since'        => $since?->toIso8601String(),
            'until'        => $until?->toIso8601String(),
            'course_id'    => $courseId,
            'participants' => $ranked->count(),
            'ranking'      => $ranked->take($limit)->values(),
            'me'           => $viewerStudentId !== null ? $ranked->firstWhere('is_me', true) : null,
        ];
    }

    /** Ranking vazio: aluno sem curso, ou consulta sem curso (não mistura CPM com IFAL). */
    private function emptyRanking(string $period, string $criterion, int $limit, array $filters): array
    {
        [$since, $until] = $this->periodRange($period);
        $base = [
            'period'       => $period,
            'since'        => $since?->toIso8601String(),
            'until'        => $until?->toIso8601String(),
            'course_id'    => null,
            'participants' => 0,
            'ranking'      => collect(),
            'me'           => null,
        ];
        if (! in_array($criterion, self::SCORED_CRITERIA, true)) {
            return $base;
        }

        $perPage = max(1, min(100, $limit));

        return $base + [
            'criterion'    => $criterion,
            'subject_id'   => isset($filters['subject_id']) ? (int) $filters['subject_id'] : null,
            'topic_id'     => isset($filters['topic_id']) ? (int) $filters['topic_id'] : null,
            'movement_reference_at' => null,
            'page'         => max(1, (int) ($filters['page'] ?? 1)),
            'per_page'     => $perPage,
            'last_page'    => 1,
        ];
    }

    /**
     * Linhas da foto horária (sem nome): o comando usa isto no SQLite, onde a view não existe.
     *
     * @return array<int, array{student_id: int, position: int, questions: int, correct: int}>
     */
    public function captureRows(int $tenantId, string $period, ?Carbon $before = null, string $criterion = self::CRITERION_PARTICIPATION, ?int $courseId = null): array
    {
        [$since, $until] = $this->periodRange($period);
        if ($before !== null && ($until === null || $before->lt($until))) {
            $until = $before;
        }
        if (in_array($criterion, self::SCORED_CRITERIA, true)) {
            return array_map(fn (array $row) => [
                'student_id' => $row['student_id'],
                'position' => $row['position'],
                'questions' => $row['questions'],
                'correct' => $row['correct'],
            ], $this->captureScoredRows($tenantId, $period, $criterion, null, null, $before, $courseId));
        }
        $position = 0;
        $previous = null;

        return $this->rankingRows($tenantId, $since, $until, $courseId)->values()->map(function ($row, int $index) use (&$position, &$previous) {
            $key = $row->questions.'|'.$row->correct;
            if ($key !== $previous) {
                $position = $index + 1;
                $previous = $key;
            }

            return [
                'student_id' => (int) $row->id,
                'position' => $position,
                'questions' => (int) $row->questions,
                'correct' => (int) $row->correct,
            ];
        })->all();
    }

    /** @return array<int, int> student_id => posição na foto usada pela seta (cerca de 24h atrás) */
    private function previousPositions(int $tenantId, string $period, string $criterion, ?int $courseId = null): array
    {
        // A foto de 10 minutos é da escola inteira. Com curso, a posição de ontem sai das respostas desse curso.
        if ($courseId) {
            return $this->positionsAt($tenantId, $period, $criterion, now()->subDay(), $courseId);
        }
        $baseline = $this->baselineCapturedAt($tenantId, $period, $criterion);
        if ($baseline !== null) {
            return DB::table('practice_ranking_snapshots')
                ->where('tenant_id', $tenantId)
                ->where('period', $period)
                ->where('criterion', $criterion)
                ->where('captured_at', $baseline)
                ->pluck('position', 'student_id')
                ->mapWithKeys(fn ($position, $studentId) => [(int) $studentId => (int) $position])
                ->all();
        }

        // Foto com menos de um dia repete o ranking de agora. A posição de 24h atrás sai das respostas.
        return $this->positionsAt($tenantId, $period, $criterion, now()->subDay());
    }

    /** @return array<int, int> student_id => posição com as respostas até $before */
    private function positionsAt(int $tenantId, string $period, string $criterion, Carbon $before, ?int $courseId = null): array
    {
        $positions = [];
        foreach ($this->captureRows($tenantId, $period, $before, $criterion, $courseId) as $row) {
            $positions[$row['student_id']] = $row['position'];
        }

        return $positions;
    }

    /** Foto usada pela seta: a mais próxima de 24h atrás, desde que tenha pelo menos 20h. */
    private function baselineCapturedAt(int $tenantId, string $period, string $criterion): mixed
    {
        $times = DB::table('practice_ranking_snapshots')
            ->where('tenant_id', $tenantId)
            ->where('period', $period)
            ->where('criterion', $criterion)
            ->where('captured_at', '<=', now()->subHours(20))
            ->distinct()
            ->pluck('captured_at');
        if ($times->isEmpty()) {
            return null;
        }

        $target = now()->subDay()->getTimestamp();

        return $times->sortBy(fn ($capturedAt) => abs(Carbon::parse($capturedAt)->getTimestamp() - $target))->first();
    }

    private function rankingRows(int $tenantId, ?Carbon $since, ?Carbon $until, ?int $courseId = null): Collection
    {
        $query = PracticeAnswer::query()->counted()
            ->where('practice_answers.tenant_id', $tenantId)
            ->when($since, fn (Builder $q) => $q->where('practice_answers.answered_at', '>=', $since))
            ->when($until, fn (Builder $q) => $q->where('practice_answers.answered_at', '<', $until))
            ->join('students as s', 's.id', '=', 'practice_answers.student_id')
            ->where('s.status', 'active')
            ->whereNull('s.deleted_at')
            ->select(
                's.id', 's.name', 's.photo_url', 's.enrollment_number',
                DB::raw('count(distinct practice_answers.exam_question_id) as questions'),
                ...$this->scoreColumns(),
            )
            ->groupBy('s.id', 's.name', 's.photo_url', 's.enrollment_number')
            ->orderByDesc('questions')->orderByDesc('correct')->orderBy('s.id');

        return $this->limitToCourse($query, $tenantId, $courseId, 's.id')->get();
    }

    /** Restringe aos alunos matriculados no curso. Sem curso, a consulta segue como está (foto legada da escola). */
    private function limitToCourse(Builder|QueryBuilder $query, int $tenantId, ?int $courseId, string $column): Builder|QueryBuilder
    {
        if (! $courseId) {
            return $query;
        }
        $ids = $this->enrollments->activeStudentIdsForCourse($tenantId, $courseId);

        return $ids->isEmpty() ? $query->whereRaw('0 = 1') : $query->whereIn($column, $ids->all());
    }

    /** @return array{0: ?Carbon, 1: ?Carbon} início (inclusivo) e fim (exclusivo), em UTC; null = sem limite. */
    private function periodRange(string $period): array
    {
        $weekStart = now(self::RANKING_TIMEZONE)->startOfWeek(Carbon::MONDAY)->utc();

        return match ($period) {
            'week'      => [$weekStart, null],
            'last_week' => [$weekStart->copy()->subWeek(), $weekStart],
            '7d'        => [now()->subDays(7), null],
            'month'     => [now()->subDays(30), null],
            default     => [null, null],
        };
    }

    /**
     * Posição e pontuação do desempenho ou da dedicação, com o mesmo desempate da lista ao vivo.
     * $before corta as respostas (fechamento de um dia).
     *
     * @return list<array{student_id: int, position: int, questions: int, correct: int, score: float}>
     */
    public function captureScoredRows(int $tenantId, string $period, string $criterion, ?int $subjectId, ?int $topicId, ?Carbon $before = null, ?int $courseId = null): array
    {
        [$since, $until] = $this->periodRange($period);
        if ($before !== null && ($until === null || $before->lt($until))) {
            $until = $before;
        }

        return $this->rankedStats($tenantId, $since, $until, $subjectId, $topicId, $before, $criterion, $courseId)
            ->values()
            ->map(fn ($row, int $index) => [
                'student_id' => (int) $row->id,
                'position' => $index + 1,
                'questions' => (int) $row->questions,
                'correct' => (int) $row->first_attempt_correct,
                'score' => $criterion === self::CRITERION_DEDICATION ? (float) $row->dedication_score : (float) $row->wilson_score,
            ])
            ->all();
    }

    /**
     * Desempenho (Wilson) ou dedicação.
     *
     * questions = questões cuja primeira tentativa histórica cai no período e no filtro.
     * answered = todas as respostas contadas no período, inclusive retentativas.
     * correct = acertos dessa primeira tentativa (não o total de acertos).
     * retakes = respostas do período que não são a primeira tentativa histórica.
     * Uma retentativa não transforma questão antiga em questão nova.
     *
     * @param  array{subject_id?: ?int, topic_id?: ?int, page?: int}  $filters
     */
    private function scoredRanking(int $tenantId, string $period, int $limit, ?int $viewerStudentId, bool $fullNames, array $filters, string $criterion): array
    {
        [$since, $until] = $this->periodRange($period);
        $subjectId = isset($filters['subject_id']) ? (int) $filters['subject_id'] : null;
        $topicId = isset($filters['topic_id']) ? (int) $filters['topic_id'] : null;
        $perPage = max(1, min(100, $limit));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $subject = $subjectId ?: null;
        $topic = $topicId ?: null;
        $courseId = (int) ($filters['course_id'] ?? 0);
        $history = app(PracticeRankingHistoryService::class);
        $history->ensureClosedDay($this, $tenantId, $criterion, $period, $courseId, $subject, $topic);
        $baseline = $history->baseline($tenantId, $criterion, $period, $courseId, $subject, $topic);
        $rows = $this->rankedStats($tenantId, $since, $until, $subject, $topic, null, $criterion, $courseId);

        $ranked = $rows->values()->map(function ($row, int $index) use ($viewerStudentId, $fullNames, $history, $baseline, $criterion) {
            $position = $index + 1;
            $questions = (int) $row->questions;
            $firstCorrect = (int) $row->first_attempt_correct;
            $accuracy = $questions > 0 ? round($firstCorrect / $questions * 100, 1) : null;
            $wilson = (float) $row->wilson_score;
            $dedication = (int) $row->dedication_score;

            return [
                'position'              => $position,
                ...$history->movementFor($position, (int) $row->id, $baseline),
                'name'                  => $fullNames ? $row->name : $this->shortName($row->name),
                'photo_url'             => $row->photo_url,
                'questions'             => $questions,
                'answered'              => (int) $row->answered,
                'correct'               => $firstCorrect,
                'accuracy'              => $accuracy,
                'level'                 => $this->level($questions, $accuracy),
                'first_attempt_correct' => $firstCorrect,
                'retakes'               => (int) $row->retakes,
                'wilson_score'          => $wilson,
                'dedication_score'      => $dedication,
                'active_days'           => (int) $row->active_days,
                'streak'                => (int) $row->streak,
                'score'                 => $criterion === self::CRITERION_DEDICATION ? $dedication : $wilson,
                'is_me'                 => $viewerStudentId !== null && (int) $row->id === $viewerStudentId,
            ] + ($fullNames ? [
                'student_id'        => (int) $row->id,
                'enrollment_number' => $row->enrollment_number,
            ] : []);
        });
        $total = $ranked->count();

        return [
            'period'       => $period,
            'criterion'    => $criterion,
            'since'        => $since?->toIso8601String(),
            'until'        => $until?->toIso8601String(),
            'subject_id'   => $subjectId ?: null,
            'topic_id'     => $topicId ?: null,
            'course_id'    => $courseId,
            'movement_reference_at' => $baseline['reference_at'] ?? null,
            'participants' => $total,
            'page'         => $page,
            'per_page'     => $perPage,
            'last_page'    => max(1, (int) ceil($total / $perPage)),
            'ranking'      => $ranked->forPage($page, $perPage)->values(),
            'me'           => $viewerStudentId !== null ? $ranked->firstWhere('is_me', true) : null,
        ];
    }

    /** Alunos do critério, já ordenados. Desempenho exige ao menos uma questão inédita no período. */
    private function rankedStats(int $tenantId, ?Carbon $since, ?Carbon $until, ?int $subjectId, ?int $topicId, ?Carbon $before, string $criterion, ?int $courseId = null): Collection
    {
        $rows = $this->attemptStats($tenantId, $since, $until, $subjectId, $topicId, $before, $courseId);
        if ($criterion === self::CRITERION_WILSON) {
            $rows = $rows->filter(fn ($row) => (int) $row->questions > 0)->values();
        }

        $sort = $criterion === self::CRITERION_DEDICATION
            ? fn ($a, $b) => self::compareDedication(
                ['score' => (int) $a->dedication_score, 'active_days' => (int) $a->active_days, 'questions' => (int) $a->questions, 'id' => (int) $a->id],
                ['score' => (int) $b->dedication_score, 'active_days' => (int) $b->active_days, 'questions' => (int) $b->questions, 'id' => (int) $b->id],
            )
            : fn ($a, $b) => self::compareWilson(
                ['score' => (float) $a->wilson_score, 'correct' => (int) $a->first_attempt_correct, 'questions' => (int) $a->questions, 'id' => (int) $a->id],
                ['score' => (float) $b->wilson_score, 'correct' => (int) $b->first_attempt_correct, 'questions' => (int) $b->questions, 'id' => (int) $b->id],
            );

        return $rows->sort($sort)->values();
    }

    /**
     * Uma passagem pelas respostas contadas. A numeração da tentativa ignora o período,
     * para achar a primeira tentativa histórica (answered_at, depois id).
     */
    private function attemptStats(int $tenantId, ?Carbon $since, ?Carbon $until, ?int $subjectId, ?int $topicId, ?Carbon $before, ?int $courseId = null): Collection
    {
        $checks = [];
        $bindings = [];
        if ($since) {
            $checks[] = 'practice_answers.answered_at >= ?';
            $bindings[] = $since->toDateTimeString();
        }
        if ($until) {
            $checks[] = 'practice_answers.answered_at < ?';
            $bindings[] = $until->toDateTimeString();
        }
        $noPeriodo = $checks === [] ? '1 = 1' : implode(' AND ', $checks);

        $marked = $this->scopedAnswers($tenantId, $subjectId, $topicId, $before)
            ->select('practice_answers.student_id', 'practice_answers.is_correct', 'practice_answers.answered_at')
            ->selectRaw('ROW_NUMBER() OVER (PARTITION BY practice_answers.student_id, practice_answers.exam_question_id ORDER BY practice_answers.answered_at ASC, practice_answers.id ASC) as tentativa')
            ->selectRaw("CASE WHEN {$noPeriodo} THEN 1 ELSE 0 END as no_periodo", $bindings);

        $days = $this->activeDays($tenantId, $since, $until, $subjectId, $topicId, $before, $courseId);

        $stats = DB::query()
            ->fromSub($marked, 'tentativa')
            ->join('students as s', 's.id', '=', 'tentativa.student_id')
            ->where('s.tenant_id', $tenantId)
            ->where('s.status', 'active')
            ->whereNull('s.deleted_at');

        return $this->limitToCourse($stats, $tenantId, $courseId, 's.id')
            ->groupBy('s.id', 's.name', 's.photo_url', 's.enrollment_number')
            ->havingRaw('sum(tentativa.no_periodo) > 0')
            ->select(
                's.id',
                's.name',
                's.photo_url',
                's.enrollment_number',
                DB::raw('sum(case when tentativa.tentativa = 1 and tentativa.no_periodo = 1 then 1 else 0 end) as questions'),
                DB::raw('sum(case when tentativa.tentativa = 1 and tentativa.no_periodo = 1 and tentativa.is_correct = 1 then 1 else 0 end) as first_attempt_correct'),
                DB::raw('sum(tentativa.no_periodo) as answered'),
                DB::raw('sum(case when tentativa.no_periodo = 1 and tentativa.tentativa > 1 then 1 else 0 end) as retakes'),
            )
            ->get()
            ->each(function ($row) use ($days) {
                $questions = (int) $row->questions;
                $firstCorrect = (int) $row->first_attempt_correct;
                $studentDays = $days[(int) $row->id] ?? [];
                $row->questions = $questions;
                $row->first_attempt_correct = $firstCorrect;
                $row->answered = (int) $row->answered;
                $row->retakes = (int) $row->retakes;
                $row->active_days = count($studentDays);
                $row->streak = $this->longestStreak($studentDays);
                $row->wilson_score = self::wilsonScore($firstCorrect, $questions);
                $row->dedication_score = self::dedicationScore($questions, $row->active_days);
            });
    }

    /** @return array<int, list<string>> student_id => dias (America/Sao_Paulo) com resposta contada no período */
    private function activeDays(int $tenantId, ?Carbon $since, ?Carbon $until, ?int $subjectId, ?int $topicId, ?Carbon $before, ?int $courseId = null): array
    {
        $day = DB::getDriverName() === 'sqlite'
            ? "date(practice_answers.answered_at, '-3 hours')"
            : "DATE(CONVERT_TZ(practice_answers.answered_at, '+00:00', '-03:00'))";

        $grouped = [];
        foreach ($this->limitToCourse(
            $this->scopedAnswers($tenantId, $subjectId, $topicId, $before)
                ->when($since, fn (Builder $q) => $q->where('practice_answers.answered_at', '>=', $since))
                ->when($until, fn (Builder $q) => $q->where('practice_answers.answered_at', '<', $until)),
            $tenantId,
            $courseId,
            'practice_answers.student_id',
        )
            ->select('practice_answers.student_id')
            ->selectRaw("{$day} as dia")
            ->groupBy('practice_answers.student_id', DB::raw($day))
            ->get() as $row) {
            $grouped[(int) $row->student_id][] = (string) $row->dia;
        }

        return $grouped;
    }

    /** Respostas contadas da escola, já filtradas por disciplina/assunto. Sem filtro de período. */
    private function scopedAnswers(int $tenantId, ?int $subjectId, ?int $topicId, ?Carbon $before): Builder
    {
        return PracticeAnswer::query()->counted()
            ->where('practice_answers.tenant_id', $tenantId)
            ->when($before, fn (Builder $q) => $q->where('practice_answers.answered_at', '<', $before))
            ->join('exam_questions as eq', 'eq.id', '=', 'practice_answers.exam_question_id')
            ->where('eq.tenant_id', $tenantId)
            ->whereNull('eq.deleted_at')
            ->when($subjectId, fn (Builder $q) => $q->where('eq.subject_id', $subjectId))
            ->when($topicId, function (Builder $q) use ($topicId, $subjectId) {
                $q->whereExists(function ($exists) use ($topicId, $subjectId) {
                    $exists->select(DB::raw(1))
                        ->from('exam_question_topic as eqt')
                        ->join('subject_topics as st', 'st.id', '=', 'eqt.subject_topic_id')
                        ->whereColumn('eqt.exam_question_id', 'practice_answers.exam_question_id')
                        ->where('eqt.subject_topic_id', $topicId)
                        ->when($subjectId, fn ($topic) => $topic->where('st.subject_id', $subjectId));
                });
            });
    }

    /** Maior sequência de dias consecutivos. */
    private function longestStreak(array $days): int
    {
        $days = array_values(array_unique($days));
        sort($days);
        $best = 0;
        $current = 0;
        $previous = null;
        foreach ($days as $day) {
            $current = $previous !== null && Carbon::parse($previous)->addDay()->toDateString() === $day
                ? $current + 1
                : 1;
            $best = max($best, $current);
            $previous = $day;
        }

        return $best;
    }

    /** Até 5 assuntos para estudar: primeiro os de acerto baixo, depois os ainda não praticados. */
    private function studyFocus(Collection $subjects): Collection
    {
        $topics = $subjects->flatMap(fn (array $subject) => collect($subject['topics'])
            ->filter(fn (array $topic) => $topic['id'] !== null)
            ->map(fn (array $topic) => $topic + ['subject' => ['id' => $subject['id'], 'name' => $subject['name']]]));

        $weak = $topics->filter(fn (array $t) => in_array($t['level'], [self::LEVEL_WEAK, self::LEVEL_ATTENTION], true))
            ->sortBy([['accuracy', 'asc'], ['answered', 'desc']])
            ->map(fn (array $t) => $t + ['reason' => 'low_accuracy']);
        $notStarted = $topics->filter(fn (array $t) => $t['level'] === self::LEVEL_NOT_STARTED && $t['available'] > 0)
            ->sortByDesc('available')
            ->map(fn (array $t) => $t + ['reason' => 'not_started']);

        return $weak->concat($notStarted)->take(self::FOCUS_LIMIT)
            ->map(fn (array $t) => [
                'subject'   => $t['subject'],
                'topic'     => ['id' => $t['id'], 'name' => $t['name']],
                'reason'    => $t['reason'],
                'level'     => $t['level'],
                'answered'  => $t['answered'],
                'correct'   => $t['correct'],
                'accuracy'  => $t['accuracy'],
                'available' => $t['available'],
            ])->values();
    }

    /** Mais urgente primeiro: fraco < atenção < poucos dados < bom < não iniciado; depois menor acerto. */
    private function compareByPriority(array $a, array $b): int
    {
        $order = [self::LEVEL_WEAK => 0, self::LEVEL_ATTENTION => 1, self::LEVEL_FEW_DATA => 2, self::LEVEL_GOOD => 3, self::LEVEL_NOT_STARTED => 4];

        return [$order[$a['level']], $a['accuracy'] ?? 0, -$a['answered'], -$a['available']]
            <=> [$order[$b['level']], $b['accuracy'] ?? 0, -$b['answered'], -$b['available']];
    }

    private function scoreColumns(): array
    {
        return [
            DB::raw('count(*) as answered'),
            DB::raw('sum(case when practice_answers.is_correct then 1 else 0 end) as correct'),
        ];
    }

    private function score(?object $row): array
    {
        $answered = (int) ($row->answered ?? 0);
        $correct = (int) ($row->correct ?? 0);
        $accuracy = $answered > 0 ? round($correct / $answered * 100, 1) : null;

        return [
            'answered' => $answered,
            'correct'  => $correct,
            'accuracy' => $accuracy,
            'level'    => $this->level($answered, $accuracy),
        ];
    }

    private function level(int $answered, ?float $accuracy): string
    {
        return match (true) {
            $answered === 0              => self::LEVEL_NOT_STARTED,
            $answered < self::MIN_SAMPLE => self::LEVEL_FEW_DATA,
            $accuracy < 50               => self::LEVEL_WEAK,
            $accuracy < 70               => self::LEVEL_ATTENTION,
            default                      => self::LEVEL_GOOD,
        };
    }

    /** "MARIA DA SILVA" → "MARIA S." para o ranking visto por outros alunos. */
    private function shortName(?string $name): string
    {
        $parts = preg_split('/\s+/', trim((string) $name)) ?: [];
        $first = $parts[0] ?? 'Aluno';
        $last = count($parts) > 1 ? end($parts) : null;

        return $last ? $first.' '.mb_substr($last, 0, 1).'.' : $first;
    }
}
