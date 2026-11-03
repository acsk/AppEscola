<?php

namespace App\Services\Bi;

use App\Models\OfficialAssessment;
use App\Services\Bi\Sources\AnswerStream;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Efetividade do ensino por turma × disciplina: evolução do acerto e das notas presenciais (período atual ×
 * anterior), alunos que evoluíram e assuntos que mais melhoraram/pioraram. Professor aparece só como contexto
 * (sem ranking). Resultado observado, não causal.
 */
class TeachingEffectivenessService
{
    public function __construct(
        private readonly MetricCatalog $catalog,
        private readonly AnswerStream $answers,
    ) {
    }

    /** @return array<string, mixed> */
    public function build(BiAccessScope $scope, BiFilters $filters): array
    {
        $key = 'bi:effectiveness:'.$scope->tenantId.':'.BiCriteria::signature().':'.md5(json_encode([$scope->classIds, $filters->toArray()]));

        return Cache::remember($key, (int) config('bi.cache_ttl_seconds', 600), fn () => $this->compute($scope, $filters));
    }

    /** @return array<string, mixed> */
    private function compute(BiAccessScope $scope, BiFilters $filters): array
    {
        $previousFilters = $filters->previous();
        $now = new StudentUniverse($scope, $filters);
        $before = new StudentUniverse($scope, $previousFilters);
        $threshold = (float) config('bi.evolution_threshold_pp', 5);
        $minStudent = (int) $this->catalog->definition('topics.mastery')['min_sample'];

        $members = $now->classMemberships()->get();
        $classesOf = $members->groupBy('student_id')->map(fn ($l) => $l->pluck('school_class_id')->map(fn ($id) => (int) $id)->all());
        $classNames = $members->pluck('class_name', 'school_class_id');

        $subjNow = $this->studentSubjects($now);
        $subjBefore = $this->studentSubjects($before)->keyBy(fn ($r) => $r->student_id.':'.$r->subject_id);
        $topicNow = $this->studentTopics($now);
        $topicBefore = $this->studentTopics($before);
        $gradesNow = $this->grades($now);
        $gradesBefore = $this->grades($before);
        $subjectNames = DB::table('subjects')->whereIn('id', $subjNow->pluck('subject_id')->merge($gradesNow->pluck('subject_id'))->unique()->all() ?: [0])->pluck('name', 'id');

        // Turma × disciplina a partir dos dados do período atual.
        $pairs = [];
        $add = function (int $classId, int $subjectId) use (&$pairs) {
            $pairs[$classId.':'.$subjectId] ??= ['class' => $classId, 'subject' => $subjectId];
        };
        foreach ($subjNow as $r) {
            foreach ($classesOf[$r->student_id] ?? [] as $classId) {
                $add($classId, $r->subject_id);
            }
        }
        foreach ($gradesNow as $g) {
            if ($g->school_class_id !== null && $classNames->has($g->school_class_id)) {
                $add($g->school_class_id, $g->subject_id);
            }
        }
        $teachers = $this->teachers($scope->tenantId, array_values($pairs));

        $inClass = fn (Collection $rows, int $classId) => $rows->filter(fn ($r) => in_array($classId, $classesOf[$r->student_id] ?? [], true));
        $items = [];
        foreach ($pairs as $key => ['class' => $classId, 'subject' => $subjectId]) {
            $now_ = $inClass($subjNow->where('subject_id', $subjectId), $classId);
            $before_ = $inClass($subjBefore->where('subject_id', $subjectId), $classId);
            $accuracy = $this->catalog->make(
                'subject.accuracy',
                $now_->sum('answers') ? $now_->sum('correct') / $now_->sum('answers') * 100 : null,
                (int) $now_->sum('answers'),
                ['students' => $now_->count()],
                $before_->sum('answers') ? $before_->sum('correct') / $before_->sum('answers') * 100 : null,
                (int) $before_->sum('answers'),
            );

            $gNow = $gradesNow->where('school_class_id', $classId)->where('subject_id', $subjectId);
            $gBefore = $gradesBefore->where('school_class_id', $classId)->where('subject_id', $subjectId);
            $grades = $this->catalog->make('grades.avg', $gNow->isEmpty() ? null : (float) $gNow->avg('pct'), $gNow->count(), [], $gBefore->isEmpty() ? null : (float) $gBefore->avg('pct'), $gBefore->count());

            // Alunos comparáveis: amostra mínima na disciplina nos dois períodos.
            $improved = 0;
            $declined = 0;
            $comparable = 0;
            foreach ($now_ as $r) {
                $prior = $subjBefore->get($r->student_id.':'.$subjectId);
                if ($r->answers < $minStudent || ! $prior || $prior->answers < $minStudent) {
                    continue;
                }
                $comparable++;
                $delta = $r->correct / $r->answers * 100 - $prior->correct / $prior->answers * 100;
                $improved += $delta >= $threshold ? 1 : 0;
                $declined += $delta <= -$threshold ? 1 : 0;
            }

            [$best, $worst] = $this->topicMoves($inClass($topicNow->where('subject_id', $subjectId), $classId), $inClass($topicBefore->where('subject_id', $subjectId), $classId), $minStudent);

            $items[] = [
                'school_class_id' => $classId,
                'class' => $classNames[$classId] ?? 'Turma',
                'subject_id' => $subjectId,
                'subject' => $subjectNames[$subjectId] ?? 'Disciplina',
                'teachers' => $teachers[$key] ?? [],
                'accuracy' => $accuracy,
                'grades' => $grades,
                'students' => ['comparable' => $comparable, 'improved' => $improved, 'declined' => $declined, 'improved_pct' => $comparable ? round($improved / $comparable * 100, 1) : null],
                'best_topic' => $best,
                'worst_topic' => $worst,
            ];
        }

        usort($items, fn ($a, $b) => strnatcasecmp($a['class'], $b['class']) ?: strnatcasecmp($a['subject'], $b['subject']));
        $deltas = collect($items)->map(fn ($i) => $i['accuracy']['delta'])->filter(fn ($d) => $d !== null);

        return [
            'meta' => [
                'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                'previous_period' => ['from' => $previousFilters->from->toDateString(), 'to' => $previousFilters->to->toDateString()],
                'filters' => $filters->toArray(),
                'evolution_threshold_pp' => $threshold,
                'min_student_answers' => $minStudent,
                'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
            ],
            'summary' => [
                'pairs' => count($items),
                'comparable' => $deltas->count(),
                'improved' => $deltas->filter(fn ($d) => $d >= $threshold)->count(),
                'declined' => $deltas->filter(fn ($d) => $d <= -$threshold)->count(),
            ],
            'items' => $items,
        ];
    }

    /** @return Collection<int, object{student_id: int, subject_id: int, answers: int, correct: int}> */
    private function studentSubjects(StudentUniverse $universe): Collection
    {
        return $this->answers->query($universe)
            ->groupBy('r.student_id', 'r.subject_id')
            ->select('r.student_id', 'r.subject_id')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->get()
            ->map(fn ($r) => (object) ['student_id' => (int) $r->student_id, 'subject_id' => (int) $r->subject_id, 'answers' => (int) $r->answers, 'correct' => (int) $r->correct]);
    }

    /** @return Collection<int, object{student_id: int, subject_id: int, topic_id: int, topic: string, answers: int, correct: int}> */
    private function studentTopics(StudentUniverse $universe): Collection
    {
        return $this->answers->query($universe)
            ->join('exam_question_topic as t', 't.exam_question_id', '=', 'r.question_id')
            ->join('subject_topics as st', 'st.id', '=', 't.subject_topic_id')
            ->groupBy('r.student_id', 'r.subject_id', 'st.id', 'st.name')
            ->select('r.student_id', 'r.subject_id', 'st.id as topic_id', 'st.name as topic')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->get()
            ->map(fn ($r) => (object) [
                'student_id' => (int) $r->student_id, 'subject_id' => (int) $r->subject_id, 'topic_id' => (int) $r->topic_id,
                'topic' => $r->topic, 'answers' => (int) $r->answers, 'correct' => (int) $r->correct,
            ]);
    }

    /** Notas presenciais lançadas (sem falta) por aluno × disciplina × avaliação, em % da máxima. */
    private function grades(StudentUniverse $universe): Collection
    {
        $classIds = $universe->classIds();

        return DB::table('official_assessment_grades as g')
            ->join('official_assessments as oa', 'oa.id', '=', 'g.official_assessment_id')
            ->where('oa.tenant_id', $universe->scope->tenantId)
            ->where('oa.status', OfficialAssessment::STATUS_PUBLISHED)
            ->whereNull('oa.deleted_at')
            ->where('oa.max_score', '>', 0)
            ->whereBetween('oa.assessment_date', $universe->filters->dateRange())
            ->where('g.is_absent', false)
            ->whereNotNull('g.grade')
            ->whereIn('g.student_id', $universe->ids() ?: [0])
            ->when($classIds !== null, fn ($q) => $q->whereIn('oa.school_class_id', $classIds ?: [0]))
            ->when($universe->filters->subjectId !== null, fn ($q) => $q->where('g.subject_id', $universe->filters->subjectId))
            ->get(['oa.school_class_id', 'g.subject_id', 'g.grade', 'oa.max_score'])
            ->map(fn ($r) => (object) [
                'school_class_id' => $r->school_class_id !== null ? (int) $r->school_class_id : null,
                'subject_id' => (int) $r->subject_id,
                'pct' => (float) $r->grade / (float) $r->max_score * 100,
            ]);
    }

    /** Assunto que mais melhorou e o que mais piorou (amostra mínima nos dois períodos). */
    private function topicMoves(Collection $now, Collection $before, int $min): array
    {
        $agg = fn (Collection $rows) => $rows->groupBy('topic_id')->map(fn ($l) => (object) [
            'topic' => $l->first()->topic,
            'answers' => $l->sum('answers'),
            'accuracy' => $l->sum('answers') ? $l->sum('correct') / $l->sum('answers') * 100 : null,
        ]);
        $a = $agg($now);
        $b = $agg($before);
        $moves = $a->filter(fn ($t, $id) => $t->answers >= $min && ($b->get($id)?->answers ?? 0) >= $min)
            ->map(fn ($t, $id) => ['topic_id' => (int) $id, 'name' => $t->topic, 'now' => round($t->accuracy, 1), 'delta_pp' => round($t->accuracy - $b->get($id)->accuracy, 1)])
            ->sortByDesc('delta_pp')
            ->values();

        $best = $moves->first();
        $worst = $moves->last();

        return [
            $best && $best['delta_pp'] > 0 ? $best : null,
            $worst && $worst['delta_pp'] < 0 ? $worst : null,
        ];
    }

    /**
     * Professores de cada turma × disciplina (horários não excluídos; pivô ou teacher_id legado).
     *
     * @param  list<array{class: int, subject: int}>  $pairs
     * @return array<string, list<string>>
     */
    private function teachers(int $tenantId, array $pairs): array
    {
        if ($pairs === []) {
            return [];
        }

        $schedules = DB::table('class_schedules as cs')
            ->where('cs.tenant_id', $tenantId)
            ->whereNull('cs.deleted_at')
            ->whereIn('cs.school_class_id', array_unique(array_column($pairs, 'class')))
            ->leftJoin('class_schedule_user as csu', 'csu.class_schedule_id', '=', 'cs.id')
            ->leftJoin('users as u', fn ($j) => $j->on('u.id', '=', DB::raw('COALESCE(csu.user_id, cs.teacher_id)')))
            ->whereNotNull('u.id')
            ->get(['cs.school_class_id', 'cs.subject_id', 'u.name']);

        return $schedules->groupBy(fn ($r) => $r->school_class_id.':'.$r->subject_id)
            ->map(fn ($l) => $l->pluck('name')->unique()->sort()->values()->all())
            ->all();
    }
}
