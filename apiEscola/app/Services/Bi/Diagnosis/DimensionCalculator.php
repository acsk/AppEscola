<?php

namespace App\Services\Bi\Diagnosis;

use App\Services\Bi\MetricCatalog;
use App\Services\Bi\PriorityTopics;
use App\Services\Bi\Sources\AnswerStream;
use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\AttendanceRecords;
use App\Services\Bi\Sources\PracticeFirstAttempts;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\Bi\StudentSignals;
use App\Services\PracticePerformanceService;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Índices de Aprendizagem, Engajamento e Preparação (0–100) para todos os alunos de um recorte, de uma vez.
 * Cada componente só conta com amostra mínima; o índice exige 2 componentes suficientes e redistribui os pesos.
 * Fórmulas no catálogo (index.*) e em docs/bi-inteligencia-educacional.md §15.
 */
class DimensionCalculator
{
    public const LEARNING = 'learning';

    public const ENGAGEMENT = 'engagement';

    public const PREPARATION = 'preparation';

    private const MIN_COMPONENTS = 2;

    private const TREND_POINTS_PER_PP = 2;

    public function __construct(
        private readonly MetricCatalog $catalog,
        private readonly AssessmentResults $assessments,
        private readonly PracticeFirstAttempts $practice,
        private readonly AttendanceRecords $attendance,
        private readonly AnswerStream $answers,
        private readonly StudentSignals $signals,
        private readonly PriorityTopics $priorities,
    ) {
    }

    /**
     * @param  int|null  $examTypeId  concurso alvo (Preparação); null = sem concurso definido
     * @return array{students: array<int, array<string, mixed>>, topics: Collection, priorities: array{weights: array<int, int>, provisional: bool}, exam_type_id: int|null}
     */
    public function compute(StudentUniverse $universe, ?int $examTypeId): array
    {
        $ids = $universe->ids();
        $allRows = $this->assessments->rows($universe);
        $rows = $allRows->groupBy('student_id');
        $practice = $this->practice->byStudent($universe);
        $attendance = $this->attendance->byStudent($universe);
        $activeDays = $this->activeDays($universe);
        $classExams = $allRows->where('modality', AssessmentResults::ONLINE)->pluck('assessment_id')->unique();
        $topics = $this->studentTopics($universe);
        $priorities = $this->priorities->resolve($universe->scope->tenantId, $examTypeId, $topics->pluck('subject_id')->unique()->values()->all());
        $trend = $this->signals->evolution(
            $allRows->when($examTypeId !== null, fn ($c) => $c->where('exam_type_id', $examTypeId))->values()
        );

        $weeks = max(1, $universe->filters->days() / 7);
        $minResults = (int) config('bi.min_student_results', 2);
        $minPractice = (int) $this->catalog->definition('practice.first_accuracy')['min_sample'];
        $minAttendance = (int) $this->catalog->definition('attendance.rate')['min_sample'];
        $minTopic = (int) $this->catalog->definition('topics.mastery')['min_sample'];
        $dedication = max(0.1, (float) config('bi.dedication_days_per_week', 3));
        $topicsByStudent = $topics->groupBy('student_id');
        $totalWeight = array_sum($priorities['weights']);

        $students = [];
        foreach ($ids as $id) {
            $results = $rows->get($id, collect());
            $p = $practice->get($id);
            $a = $attendance->get($id);
            $days = (int) ($activeDays[$id] ?? 0);
            $daysPerWeek = $days / $weeks;
            $mine = $topicsByStudent->get($id, collect())->keyBy('topic_id');

            // Preparação: só assuntos prioritários com amostra mínima.
            $masteryNum = 0.0;
            $coveredWeight = 0;
            foreach ($priorities['weights'] as $topicId => $weight) {
                $t = $mine->get($topicId);
                if ($t && $t->answers >= $minTopic) {
                    $masteryNum += $weight * $t->correct / $t->answers * 100;
                    $coveredWeight += $weight;
                }
            }

            $learning = $this->index([
                $this->component('assessments', 'Média nas avaliações', $results->isEmpty() ? null : (float) $results->avg('pct'), $results->count(), $minResults, 0.6),
                $this->component('practice', 'Acertos no banco', $p && $p->answers ? $p->correct / $p->answers * 100 : null, (int) ($p->answers ?? 0), $minPractice, 0.4),
            ]);
            $engagement = $this->index([
                $this->component('attendance', 'Frequência nas aulas', $a && $a->records ? $a->present / $a->records * 100 : null, (int) ($a->records ?? 0), $minAttendance, 0.4),
                $this->component('regularity', 'Regularidade (dias ativos/semana)', min(100, $daysPerWeek / $dedication * 100), $days, 0, 0.3, round($daysPerWeek, 1)),
                $this->component(
                    'participation',
                    'Participação nos simulados',
                    $classExams->isEmpty() ? null : $results->where('modality', AssessmentResults::ONLINE)->pluck('assessment_id')->unique()->count() / $classExams->count() * 100,
                    $classExams->count(),
                    1,
                    0.3,
                ),
            ]);
            $preparation = $this->index([
                $this->component('mastery', 'Domínio dos prioritários', $coveredWeight ? $masteryNum / $coveredWeight : null, $coveredWeight, 1, 0.5),
                $this->component('coverage', 'Cobertura dos prioritários', $totalWeight ? $coveredWeight / $totalWeight * 100 : null, $totalWeight, 1, 0.3),
                $this->component('trend', 'Tendência nas avaliações do concurso', isset($trend[$id]) ? max(0, min(100, 50 + self::TREND_POINTS_PER_PP * $trend[$id])) : null, isset($trend[$id]) ? 1 : 0, 1, 0.2, isset($trend[$id]) ? round($trend[$id], 1) : null),
            ]);

            $students[$id] = [
                self::LEARNING => $learning,
                self::ENGAGEMENT => $engagement,
                self::PREPARATION => $preparation,
                'active_days' => $days,
                'active_days_per_week' => round($daysPerWeek, 1),
                'questions' => (int) ($p->answers ?? 0),
                'assessments' => $results->count(),
                'assessments_avg' => $results->isEmpty() ? null : round((float) $results->avg('pct'), 1),
            ];
        }

        return ['students' => $students, 'topics' => $topics, 'priorities' => $priorities, 'exam_type_id' => $examTypeId];
    }

    /** Média do índice entre os alunos que têm o índice (para a comparação com a turma). */
    public static function average(array $students, string $dimension): ?float
    {
        $values = array_filter(array_map(fn ($s) => $s[$dimension]['value'], $students), fn ($v) => $v !== null);

        return $values ? round(array_sum($values) / count($values), 1) : null;
    }

    /** @param  list<array<string, mixed>>  $components */
    private function index(array $components): array
    {
        $sufficient = array_filter($components, fn ($c) => $c['sufficient']);
        $weight = array_sum(array_column($sufficient, 'weight'));
        // Combina os valores exatos (o arredondamento é só para exibir cada componente).
        $value = count($sufficient) >= self::MIN_COMPONENTS && $weight > 0
            ? round(array_sum(array_map(fn ($c) => $c['exact'] * $c['weight'], $sufficient)) / $weight, 1)
            : null;

        return ['value' => $value, 'components' => array_map(fn ($c) => array_diff_key($c, ['exact' => true]), $components)];
    }

    private function component(string $key, string $label, ?float $value, int $n, int $min, float $weight, int|float|null $raw = null): array
    {
        $sufficient = $value !== null && $n >= $min;

        return [
            'key' => $key,
            'label' => $label,
            'value' => $sufficient ? round($value, 1) : null,
            'exact' => $sufficient ? $value : null,
            'raw' => $raw,
            'n' => $n,
            'min_sample' => $min,
            'weight' => $weight,
            'sufficient' => $sufficient,
        ];
    }

    /**
     * Acertos por aluno × assunto (simulados + banco, 1ª tentativa).
     *
     * @return Collection<int, object{student_id: int, topic_id: int, topic: string, subject_id: int, subject: string, answers: int, correct: int}>
     */
    private function studentTopics(StudentUniverse $universe): Collection
    {
        return $this->answers->query($universe)
            ->join('exam_question_topic as t', 't.exam_question_id', '=', 'r.question_id')
            ->join('subject_topics as st', 'st.id', '=', 't.subject_topic_id')
            ->join('subjects as s', 's.id', '=', 'st.subject_id')
            ->groupBy('r.student_id', 'st.id', 'st.name', 's.id', 's.name')
            ->select('r.student_id', 'st.id as topic_id', 'st.name as topic', 's.id as subject_id', 's.name as subject')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->get()
            ->map(fn ($r) => (object) [
                'student_id' => (int) $r->student_id,
                'topic_id' => (int) $r->topic_id,
                'topic' => $r->topic,
                'subject_id' => (int) $r->subject_id,
                'subject' => $r->subject,
                'answers' => (int) $r->answers,
                'correct' => (int) $r->correct,
            ]);
    }

    /**
     * Dias distintos com atividade por aluno: uso do app, resposta no banco, simulado concluído ou presença.
     *
     * @return array<int, int>
     */
    private function activeDays(StudentUniverse $universe): array
    {
        return DB::query()->fromSub($this->activityDays($universe), 'd')
            ->groupBy('d.student_id')
            ->select('d.student_id')
            ->selectRaw('COUNT(DISTINCT d.day) as days')
            ->pluck('days', 'student_id')
            ->map(fn ($n) => (int) $n)
            ->all();
    }

    /**
     * Pares (aluno, dia) com atividade, sem repetição. Datas no fuso da escola.
     * Colunas: student_id, day.
     */
    public function activityDays(StudentUniverse $universe): Builder
    {
        $tenantId = $universe->scope->tenantId;
        $ids = $universe->ids() ?: [0];
        [$from, $until] = $universe->filters->utcRange();
        [$fromDate, $toDate] = $universe->filters->dateRange();
        $offset = Carbon::now(PracticePerformanceService::RANKING_TIMEZONE)->format('P');
        $localDate = fn (string $column) => "DATE(CONVERT_TZ({$column}, '+00:00', '{$offset}'))";

        $app = DB::table('student_activity_days')
            ->where('tenant_id', $tenantId)->whereIn('student_id', $ids)
            ->whereBetween('activity_date', [$fromDate, $toDate])
            ->select('student_id', 'activity_date as day');
        $practice = DB::table('practice_answers')
            ->where('tenant_id', $tenantId)->whereIn('student_id', $ids)
            ->where('answered_at', '>=', $from)->where('answered_at', '<', $until)
            ->select('student_id')->selectRaw($localDate('answered_at').' as day');
        $exams = DB::table('exam_attempts')
            ->where('tenant_id', $tenantId)->whereIn('student_id', $ids)->whereNull('deleted_at')
            ->where('finished_at', '>=', $from)->where('finished_at', '<', $until)
            ->select('student_id')->selectRaw($localDate('finished_at').' as day');
        $presence = DB::table('student_attendances')
            ->where('tenant_id', $tenantId)->whereIn('student_id', $ids)->whereNull('deleted_at')
            ->whereBetween('attendance_date', [$fromDate, $toDate])->whereIn('status', ['present', 'late'])
            ->select('student_id', 'attendance_date as day');

        return $app->union($practice)->union($exams)->union($presence);
    }
}
