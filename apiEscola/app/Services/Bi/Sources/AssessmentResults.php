<?php

namespace App\Services\Bi\Sources;

use App\Models\OfficialAssessment;
use App\Services\Bi\BiFilters;
use App\Services\PracticePerformanceService;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Resultados de avaliações em percentual da nota máxima, um por aluno e avaliação.
 * Online: primeira tentativa concluída do simulado. Presencial: avaliações publicadas,
 * sem falta e com nota lançada (falta não vira zero). Com filtro de disciplina, o online
 * usa só as questões daquela disciplina.
 */
class AssessmentResults
{
    public const ONLINE = BiFilters::MODALITY_ONLINE;

    public const PRESENCIAL = BiFilters::MODALITY_PRESENCIAL;

    private const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    /**
     * @return Collection<int, object{student_id: int, modality: string, assessment_id: int, exam_type_id: int|null, at: string, pct: float}>
     */
    public function rows(StudentUniverse $universe, ?BiFilters $filters = null): Collection
    {
        $filters ??= $universe->filters;
        $rows = collect();

        if ($filters->modality !== self::PRESENCIAL) {
            $rows = $rows->concat($this->online($universe, $filters));
        }
        if ($filters->modality !== self::ONLINE) {
            $rows = $rows->concat($this->presencial($universe, $filters));
        }

        return $rows->sortBy('at')->values();
    }

    /**
     * Primeira tentativa concluída de cada aluno em cada simulado, terminada no período.
     * Colunas: attempt_id, student_id, exam_id, exam_type_id, finished_at, percentage.
     */
    public function firstOnlineAttempts(StudentUniverse $universe, ?BiFilters $filters = null): Builder
    {
        $filters ??= $universe->filters;
        [$from, $until] = $filters->utcRange();

        $numbered = $this->numberedAttempts($universe->scope->tenantId, $universe->ids())
            ->when($filters->examTypeId !== null, fn ($q) => $q->where('ex.exam_type_id', $filters->examTypeId));

        return DB::query()->fromSub($numbered, 'a')
            ->where('a.tentativa', 1)
            ->where('a.finished_at', '>=', $from)
            ->where('a.finished_at', '<', $until);
    }

    /**
     * Média mensal por modalidade (meses sem avaliação = null, não zero).
     *
     * @return list<array{month: string, label: string, online: array, presencial: array}>
     */
    public function monthly(Collection $rows, BiFilters $filters): array
    {
        $months = [];
        $cursor = $filters->from->copy()->startOfMonth();
        while ($cursor->lte($filters->to)) {
            $months[$cursor->format('Y-m')] = $cursor->copy();
            $cursor->addMonth();
        }

        return array_values(array_map(function (Carbon $month) use ($rows) {
            $key = $month->format('Y-m');
            $point = ['month' => $key, 'label' => self::MONTHS[$month->month - 1]];
            foreach ([self::ONLINE, self::PRESENCIAL] as $modality) {
                $inMonth = $rows->filter(fn ($r) => $r->modality === $modality && str_starts_with($r->at, $key));
                $point[$modality] = [
                    'value' => $inMonth->isEmpty() ? null : round((float) $inMonth->avg('pct'), 1),
                    'students' => $inMonth->pluck('student_id')->unique()->count(),
                ];
            }

            return $point;
        }, $months));
    }

    /**
     * Tentativas concluídas numeradas por aluno × simulado em toda a história (tentativa 1 = primeira).
     * Colunas: attempt_id, student_id, exam_id, exam_type_id, finished_at, percentage, tentativa.
     *
     * @param  list<int>|null  $studentIds  null = todos os alunos do tenant
     */
    public function numberedAttempts(int $tenantId, ?array $studentIds = null): Builder
    {
        return DB::table('exam_attempts as ea')
            ->join('exam_attempt_statuses as st', 'st.id', '=', 'ea.attempt_status_id')
            ->join('exams as ex', 'ex.id', '=', 'ea.exam_id')
            ->where('ea.tenant_id', $tenantId)
            ->where('st.slug', 'completed')
            ->whereNotNull('ea.finished_at')
            ->whereNotNull('ea.percentage')
            ->whereNull('ea.deleted_at')
            ->whereNull('ex.deleted_at')
            ->when($studentIds !== null, fn ($q) => $q->whereIn('ea.student_id', $studentIds ?: [0]))
            ->select('ea.id as attempt_id', 'ea.student_id', 'ea.exam_id', 'ex.exam_type_id', 'ea.finished_at', 'ea.percentage')
            ->selectRaw('ROW_NUMBER() OVER (PARTITION BY ea.student_id, ea.exam_id ORDER BY ea.finished_at, ea.id) as tentativa');
    }

    private function online(StudentUniverse $universe, BiFilters $filters): Collection
    {
        $query = $this->firstOnlineAttempts($universe, $filters)
            ->select('a.student_id', 'a.exam_id as assessment_id', 'a.exam_type_id', 'a.finished_at as at');

        if ($filters->subjectId === null) {
            $query->addSelect('a.percentage as pct');
        } else {
            // Percentual só nas questões da disciplina: pontos obtidos ÷ pontos possíveis do simulado.
            $possible = DB::table('exam_questions')
                ->where('subject_id', $filters->subjectId)
                ->where('is_annulled', false)
                ->whereNull('deleted_at')
                ->groupBy('exam_id')
                ->select('exam_id')
                ->selectRaw('SUM(points) as total');
            $earned = DB::table('exam_answers as ans')
                ->join('exam_questions as q', 'q.id', '=', 'ans.question_id')
                ->where('q.subject_id', $filters->subjectId)
                ->where('q.is_annulled', false)
                ->groupBy('ans.attempt_id')
                ->select('ans.attempt_id')
                ->selectRaw('SUM(ans.points_earned) as earned');

            $query->joinSub($possible, 'pq', 'pq.exam_id', '=', 'a.exam_id')
                ->leftJoinSub($earned, 'er', 'er.attempt_id', '=', 'a.attempt_id')
                ->where('pq.total', '>', 0)
                ->selectRaw('COALESCE(er.earned, 0) / pq.total * 100 as pct');
        }

        return $query->get()->map(fn ($row) => (object) [
            'student_id' => (int) $row->student_id,
            'modality' => self::ONLINE,
            'assessment_id' => (int) $row->assessment_id,
            'exam_type_id' => $row->exam_type_id !== null ? (int) $row->exam_type_id : null,
            'at' => Carbon::parse($row->at, 'UTC')->setTimezone(PracticePerformanceService::RANKING_TIMEZONE)->toDateString(),
            'pct' => round((float) $row->pct, 2),
        ]);
    }

    private function presencial(StudentUniverse $universe, BiFilters $filters): Collection
    {
        [$from, $to] = $filters->dateRange();
        $classIds = $universe->classIds();

        return DB::table('official_assessment_grades as g')
            ->join('official_assessments as oa', 'oa.id', '=', 'g.official_assessment_id')
            ->where('oa.tenant_id', $universe->scope->tenantId)
            ->where('oa.status', OfficialAssessment::STATUS_PUBLISHED)
            ->whereNull('oa.deleted_at')
            ->where('oa.max_score', '>', 0)
            ->whereBetween('oa.assessment_date', [$from, $to])
            ->where('g.is_absent', false)
            ->whereNotNull('g.grade')
            ->whereIn('g.student_id', $universe->ids() ?: [0])
            ->when($classIds !== null, fn ($q) => $q->whereIn('oa.school_class_id', $classIds ?: [0]))
            ->when($filters->subjectId !== null, fn ($q) => $q->where('g.subject_id', $filters->subjectId))
            ->when($filters->examTypeId !== null, fn ($q) => $q->where('oa.exam_type_id', $filters->examTypeId))
            ->groupBy('g.student_id', 'oa.id', 'oa.exam_type_id', 'oa.assessment_date')
            ->select('g.student_id', 'oa.id as assessment_id', 'oa.exam_type_id', 'oa.assessment_date as at')
            ->selectRaw('AVG(g.grade / oa.max_score * 100) as pct')
            ->get()
            ->map(fn ($row) => (object) [
                'student_id' => (int) $row->student_id,
                'modality' => self::PRESENCIAL,
                'assessment_id' => (int) $row->assessment_id,
                'exam_type_id' => $row->exam_type_id !== null ? (int) $row->exam_type_id : null,
                'at' => substr((string) $row->at, 0, 10),
                'pct' => round((float) $row->pct, 2),
            ]);
    }
}
