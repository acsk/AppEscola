<?php

namespace App\Services\Bi\Interventions;

use App\Models\PedagogicalIntervention as Intervention;
use App\Models\PedagogicalInterventionEvent as Event;
use App\Models\User;
use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiFilters;
use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\Bi\StudentSignals;
use App\Services\PracticePerformanceService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Acompanhamento pedagógico: sugestões (alunos em atenção sem intervenção aberta), intervenções com fluxo,
 * "antes"/"depois" medidos pelos dados e efetividade por tipo. Visibilidade:
 * coordenação vê tudo; professor vê as dos alunos das suas turmas e as que conduz; secretaria só as atribuídas.
 */
class InterventionService
{
    public const TAB_ACTIVE = 'active';

    public const TAB_REASSESSMENT = 'reassessment';

    public const TAB_COMPLETED = 'completed';

    public const TABS = [self::TAB_ACTIVE, self::TAB_REASSESSMENT, self::TAB_COMPLETED];

    private const TAB_STATUS = [
        self::TAB_ACTIVE => [Intervention::STATUS_PLANNED, Intervention::STATUS_IN_PROGRESS],
        self::TAB_REASSESSMENT => [Intervention::STATUS_REASSESSMENT],
        self::TAB_COMPLETED => [Intervention::STATUS_COMPLETED],
    ];

    public function __construct(
        private readonly InterventionMeasure $measure,
        private readonly AssessmentResults $assessments,
        private readonly StudentSignals $signals,
    ) {
    }

    // ── Visibilidade e permissões ────────────────────────────────────────────────

    public function visible(BiAccessScope $scope): Builder
    {
        return Intervention::query()
            ->where('tenant_id', $scope->tenantId)
            ->when(! $scope->isTenantWide(), fn (Builder $q) => $q->where(function (Builder $w) use ($scope) {
                $w->where('responsible_user_id', $scope->userId);
                if ($this->isTeacher($scope)) {
                    $w->orWhere('created_by', $scope->userId)
                        ->orWhereHas('students', fn ($s) => $s->whereIn('student_id', $this->teacherStudentIds($scope) ?: [0]));
                }
            }));
    }

    public function canManage(BiAccessScope $scope, Intervention $intervention): bool
    {
        return $scope->isTenantWide()
            || $intervention->responsible_user_id === $scope->userId
            || ($this->isTeacher($scope) && $intervention->created_by === $scope->userId);
    }

    /** Coordenação cria para qualquer aluno; professor só para alunos das suas turmas; secretaria não cria. */
    public function canCreateFor(BiAccessScope $scope, array $studentIds): bool
    {
        if ($scope->isTenantWide()) {
            return true;
        }

        return $this->isTeacher($scope) && array_diff($studentIds, $this->teacherStudentIds($scope)) === [];
    }

    // ── Leitura ──────────────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function summary(BiAccessScope $scope, BiFilters $filters): array
    {
        $open = $this->visible($scope)->whereIn('status', Intervention::OPEN)->get(['kind', 'status']);
        [$from, $until] = $filters->utcRange();
        $completed = $this->visible($scope)->where('status', Intervention::STATUS_COMPLETED)
            ->where('completed_at', '>=', $from)->where('completed_at', '<', $until)->count();

        return [
            'suggestions' => count($this->suggestionRows($scope, $filters)),
            'active' => $open->whereIn('status', self::TAB_STATUS[self::TAB_ACTIVE])->count(),
            'active_individual' => $open->whereIn('status', self::TAB_STATUS[self::TAB_ACTIVE])->where('kind', Intervention::KIND_INDIVIDUAL)->count(),
            'active_group' => $open->whereIn('status', self::TAB_STATUS[self::TAB_ACTIVE])->where('kind', Intervention::KIND_GROUP)->count(),
            'reassessment' => $open->where('status', Intervention::STATUS_REASSESSMENT)->count(),
            'completed' => $completed,
            'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
        ];
    }

    /** Alunos em atenção no recorte sem intervenção aberta e sem descarte recente. */
    public function suggestions(BiAccessScope $scope, BiFilters $filters): array
    {
        $rows = $this->suggestionRows($scope, $filters);
        $ids = array_keys($rows);
        $names = DB::table('students')->whereIn('id', $ids ?: [0])->pluck('name', 'id');
        $classes = (new StudentUniverse($scope, $filters))->classNamesByStudent($ids);

        $items = array_map(fn (int $id) => [
            'student_id' => $id,
            'name' => $names[$id] ?? 'Aluno',
            'classes' => $classes[$id] ?? [],
            'reasons' => $rows[$id],
        ], $ids);
        usort($items, fn ($a, $b) => count($b['reasons']) <=> count($a['reasons']) ?: strnatcasecmp($a['name'], $b['name']));

        return ['total' => count($items), 'items' => $items];
    }

    /** @return array<string, mixed> */
    public function list(BiAccessScope $scope, string $tab): array
    {
        $items = $this->visible($scope)
            ->whereIn('status', self::TAB_STATUS[$tab])
            ->with(['students.student:id,name', 'responsible:id,name', 'schoolClass:id,name', 'topic:id,name', 'subject:id,name'])
            ->orderByRaw('reassess_on IS NULL, reassess_on')
            ->orderByDesc('id')
            ->limit(200)
            ->get();

        return ['tab' => $tab, 'items' => $items->map(fn (Intervention $i) => $this->card($i))->all()];
    }

    /** @return array<string, mixed> */
    public function show(BiAccessScope $scope, Intervention $intervention): array
    {
        $intervention->load(['students.student:id,name', 'responsible:id,name', 'schoolClass:id,name', 'topic:id,name', 'subject:id,name', 'events.user:id,name,role']);
        $open = in_array($intervention->status, Intervention::OPEN, true);
        $current = $open
            ? $this->measure->measure(
                $intervention->tenant_id,
                $intervention->students->pluck('student_id')->all(),
                $intervention->subject_id,
                $intervention->subject_topic_id,
                $intervention->starts_on->copy(),
                Carbon::now(PracticePerformanceService::RANKING_TIMEZONE),
            )
            : [];

        return $this->card($intervention) + [
            'target' => $this->target($intervention),
            'students' => $intervention->students->map(fn ($s) => [
                'student_id' => $s->student_id,
                'name' => $s->student?->name ?? 'Aluno',
                'baseline' => ['pct' => $s->baseline_pct, 'n' => $s->baseline_n],
                'current' => $open ? $current[$s->student_id] ?? ['pct' => null, 'n' => 0] : null,
                'result' => $intervention->status === Intervention::STATUS_COMPLETED ? ['pct' => $s->result_pct, 'n' => $s->result_n] : null,
            ])->values()->all(),
            'steps' => $this->steps($intervention),
            'events' => $intervention->events->map(fn (Event $e) => [
                'id' => $e->id,
                'type' => $e->type,
                'description' => $e->description,
                'data' => $e->data,
                'user' => $e->user?->name,
                'occurred_at' => $e->occurred_at->toIso8601String(),
            ])->all(),
            'can_manage' => $this->canManage($scope, $intervention),
        ];
    }

    /** Antes × depois por tipo, nas intervenções concluídas no período (alunos com as duas medidas). */
    public function effectiveness(BiAccessScope $scope, BiFilters $filters): array
    {
        [$from, $until] = $filters->utcRange();
        $rows = DB::table('pedagogical_intervention_students as s')
            ->joinSub(
                $this->visible($scope)->where('status', Intervention::STATUS_COMPLETED)
                    ->where('completed_at', '>=', $from)->where('completed_at', '<', $until)
                    ->select('id', 'type')->toBase(),
                'i',
                'i.id',
                '=',
                's.intervention_id',
            )
            ->select('i.id', 'i.type', 's.baseline_pct', 's.result_pct')
            ->get();

        $items = $rows->groupBy('type')->map(function ($list, $type) {
            $paired = $list->filter(fn ($r) => $r->baseline_pct !== null && $r->result_pct !== null);
            $before = $paired->isEmpty() ? null : round((float) $paired->avg('baseline_pct'), 1);
            $after = $paired->isEmpty() ? null : round((float) $paired->avg('result_pct'), 1);

            return [
                'type' => $type,
                'label' => Intervention::TYPES[$type] ?? $type,
                'interventions' => $list->pluck('id')->unique()->count(),
                'students' => $paired->count(),
                'before' => $before,
                'after' => $after,
                'delta_pp' => $before !== null && $after !== null ? round($after - $before, 1) : null,
            ];
        })->sortByDesc('interventions')->values()->all();

        return [
            'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
            'goal_pct' => (float) config('bi.goal_pct', 70),
            'completed' => $rows->pluck('id')->unique()->count(),
            'items' => $items,
        ];
    }

    // ── Escrita ──────────────────────────────────────────────────────────────────

    /** @param  array<string, mixed>  $data  validado */
    public function create(BiAccessScope $scope, array $data): Intervention
    {
        return DB::transaction(function () use ($scope, $data) {
            $studentIds = array_values(array_unique(array_map('intval', $data['student_ids'])));
            $startsOn = Carbon::parse($data['starts_on']);
            $intervention = Intervention::create([
                'tenant_id' => $scope->tenantId,
                'kind' => count($studentIds) > 1 ? Intervention::KIND_GROUP : Intervention::KIND_INDIVIDUAL,
                'type' => $data['type'],
                'title' => $data['title'] ?? Intervention::TYPES[$data['type']],
                'reason_code' => $data['reason_code'],
                'reason_detail' => $data['reason_detail'] ?? null,
                'subject_id' => $data['subject_id'] ?? null,
                'subject_topic_id' => $data['subject_topic_id'] ?? null,
                'school_class_id' => $data['school_class_id'] ?? null,
                'status' => $data['status'] ?? Intervention::STATUS_PLANNED,
                'responsible_user_id' => $data['responsible_user_id'] ?? $scope->userId,
                'starts_on' => $startsOn,
                'reassess_on' => $data['reassess_on'] ?? null,
                'created_by' => $scope->userId,
                'updated_by' => $scope->userId,
            ]);

            $baseline = $this->measure->measure(
                $scope->tenantId,
                $studentIds,
                $intervention->subject_id,
                $intervention->subject_topic_id,
                $startsOn->copy()->subDays((int) config('bi.intervention_baseline_days', 60)),
                $startsOn->copy()->subDay(),
            );
            foreach ($studentIds as $id) {
                $intervention->students()->create([
                    'tenant_id' => $scope->tenantId,
                    'student_id' => $id,
                    'baseline_pct' => $baseline[$id]['pct'],
                    'baseline_n' => $baseline[$id]['n'],
                ]);
            }

            $this->event($intervention, $scope, Event::CREATED, $data['note'] ?? null, ['students' => count($studentIds), 'status' => $intervention->status]);

            return $intervention;
        });
    }

    /** @param  array<string, mixed>  $data  validado (parcial) */
    public function update(BiAccessScope $scope, Intervention $intervention, array $data): Intervention
    {
        return DB::transaction(function () use ($scope, $intervention, $data) {
            $from = $intervention->status;
            $fields = array_intersect_key($data, array_flip(['type', 'title', 'reason_code', 'reason_detail', 'subject_topic_id', 'responsible_user_id', 'reassess_on', 'status']));
            if (($fields['status'] ?? null) === Intervention::STATUS_CANCELLED) {
                $fields['cancelled_at'] = now();
            }
            $intervention->fill($fields + ['updated_by' => $scope->userId])->save();

            if ($from !== $intervention->status) {
                $this->event($intervention, $scope, Event::STATUS_CHANGED, $data['note'] ?? null, ['from' => $from, 'to' => $intervention->status]);
            } elseif ($fields !== []) {
                $this->event($intervention, $scope, Event::UPDATED, $data['note'] ?? null, ['fields' => array_keys($fields)]);
            }

            return $intervention;
        });
    }

    /** Conclui medindo o "depois" (do início até hoje) de cada aluno e grava. */
    public function complete(BiAccessScope $scope, Intervention $intervention, ?string $note): Intervention
    {
        return DB::transaction(function () use ($scope, $intervention, $note) {
            $students = $intervention->students()->get();
            $result = $this->measure->measure(
                $intervention->tenant_id,
                $students->pluck('student_id')->all(),
                $intervention->subject_id,
                $intervention->subject_topic_id,
                $intervention->starts_on->copy(),
                Carbon::now(PracticePerformanceService::RANKING_TIMEZONE),
            );
            foreach ($students as $s) {
                $s->update(['result_pct' => $result[$s->student_id]['pct'], 'result_n' => $result[$s->student_id]['n']]);
            }

            $from = $intervention->status;
            $intervention->update(['status' => Intervention::STATUS_COMPLETED, 'completed_at' => now(), 'updated_by' => $scope->userId]);
            $paired = $students->fresh()->filter(fn ($s) => $s->baseline_pct !== null && $s->result_pct !== null);
            $this->event($intervention, $scope, Event::COMPLETED, $note, [
                'from' => $from,
                'before' => $paired->isEmpty() ? null : round((float) $paired->avg('baseline_pct'), 1),
                'after' => $paired->isEmpty() ? null : round((float) $paired->avg('result_pct'), 1),
                'students_with_result' => $paired->count(),
            ]);

            return $intervention;
        });
    }

    public function addEvent(BiAccessScope $scope, Intervention $intervention, string $type, string $description): void
    {
        $this->event($intervention, $scope, $type, $description);
    }

    public function dismiss(BiAccessScope $scope, int $studentId, string $reason): void
    {
        Event::create([
            'tenant_id' => $scope->tenantId,
            'student_id' => $studentId,
            'type' => Event::SUGGESTION_DISMISSED,
            'description' => $reason,
            'user_id' => $scope->userId ?: null,
            'occurred_at' => now(),
        ]);
    }

    // ── Apoio ────────────────────────────────────────────────────────────────────

    /** @return array<int, list<array<string, mixed>>> aluno => motivos */
    private function suggestionRows(BiAccessScope $scope, BiFilters $filters): array
    {
        if (! $scope->isTenantWide() && ! $this->isTeacher($scope)) {
            return [];
        }

        $universe = new StudentUniverse($scope, $filters);
        $rows = $this->assessments->rows($universe);
        $reasons = $this->signals->supportReasons($universe, $rows, $this->signals->evolution($rows));
        if ($reasons === []) {
            return [];
        }

        $open = DB::table('pedagogical_intervention_students as s')
            ->join('pedagogical_interventions as i', 'i.id', '=', 's.intervention_id')
            ->where('i.tenant_id', $scope->tenantId)
            ->whereNull('i.deleted_at')
            ->whereIn('i.status', Intervention::OPEN)
            ->whereIn('s.student_id', array_keys($reasons))
            ->pluck('s.student_id');
        $dismissed = Event::query()
            ->where('tenant_id', $scope->tenantId)
            ->where('type', Event::SUGGESTION_DISMISSED)
            ->where('occurred_at', '>=', now()->subDays((int) config('bi.suggestion_dismiss_days', 30)))
            ->whereIn('student_id', array_keys($reasons))
            ->pluck('student_id');

        return array_diff_key($reasons, array_flip($open->merge($dismissed)->map(fn ($id) => (int) $id)->all()));
    }

    /** @return array<string, mixed> */
    private function card(Intervention $i): array
    {
        $students = $i->students;
        $first = $students->first();

        return [
            'id' => $i->id,
            'code' => '#INT-'.str_pad((string) $i->id, 4, '0', STR_PAD_LEFT),
            'kind' => $i->kind,
            'type' => $i->type,
            'type_label' => Intervention::TYPES[$i->type] ?? $i->type,
            'title' => $i->title,
            'reason' => ['code' => $i->reason_code, 'label' => Intervention::REASONS[$i->reason_code] ?? $i->reason_code, 'detail' => $i->reason_detail],
            'status' => $i->status,
            'who' => $i->kind === Intervention::KIND_GROUP
                ? 'Grupo · '.$students->count().' alunos'
                : ($first?->student?->name ?? 'Aluno'),
            'student_id' => $i->kind === Intervention::KIND_INDIVIDUAL ? $first?->student_id : null,
            'school_class' => $i->schoolClass?->name,
            'target' => $i->topic?->name ?? $i->subject?->name,
            'responsible' => $i->responsible ? ['id' => $i->responsible->id, 'name' => $i->responsible->name] : null,
            'starts_on' => $i->starts_on->toDateString(),
            'reassess_on' => $i->reassess_on?->toDateString(),
            'overdue' => $i->reassess_on !== null && in_array($i->status, Intervention::OPEN, true) && $i->reassess_on->lt(Carbon::today(PracticePerformanceService::RANKING_TIMEZONE)),
        ];
    }

    /** @return array{label: string, scope: string} */
    private function target(Intervention $i): array
    {
        return match (true) {
            $i->subject_topic_id !== null => ['label' => $i->topic?->name ?? 'Assunto', 'scope' => 'topic'],
            $i->subject_id !== null => ['label' => $i->subject?->name ?? 'Disciplina', 'scope' => 'subject'],
            default => ['label' => 'Média nas avaliações', 'scope' => 'assessments'],
        };
    }

    /** Fluxo em 8 etapas (done | current | pending), derivado da situação e da linha do tempo. */
    private function steps(Intervention $i): array
    {
        $events = $i->events;
        $tenantWide = config('bi.tenant_wide_roles', []);
        $reviewed = $events->first(fn (Event $e) => in_array($e->user?->role, $tenantWide, true));
        $progress = $events->whereIn('type', [Event::PROGRESS, Event::NOTE])->last();
        $status = $i->status;
        $done = fn (bool $condition) => $condition ? 'done' : 'pending';
        $fmt = fn (?Carbon $d) => $d?->format('d/m');

        $steps = [
            ['key' => 'indicator', 'label' => 'Indicador de atenção', 'state' => 'done', 'detail' => (Intervention::REASONS[$i->reason_code] ?? $i->reason_code).' · '.$fmt($i->created_at)],
            ['key' => 'reason', 'label' => 'Motivo registrado', 'state' => $done((string) $i->reason_detail !== ''), 'detail' => $i->reason_detail],
            ['key' => 'reviewed', 'label' => 'Avaliado pela coordenação', 'state' => $done($reviewed !== null), 'detail' => $reviewed ? $reviewed->user?->name.' · '.$fmt($reviewed->occurred_at) : null],
            ['key' => 'defined', 'label' => 'Intervenção definida', 'state' => 'done', 'detail' => $i->title],
            ['key' => 'owner', 'label' => 'Responsável e prazo', 'state' => $done($i->responsible_user_id !== null && $i->reassess_on !== null), 'detail' => trim(($i->responsible?->name ?? '').($i->reassess_on ? ' · até '.$i->reassess_on->format('d/m') : ''), ' ·')],
            ['key' => 'progress', 'label' => 'Acompanhar progresso', 'state' => match ($status) {
                Intervention::STATUS_IN_PROGRESS => 'current',
                Intervention::STATUS_REASSESSMENT, Intervention::STATUS_COMPLETED => 'done',
                default => 'pending',
            }, 'detail' => $progress?->description],
            ['key' => 'reassess', 'label' => 'Nova avaliação', 'state' => match ($status) {
                Intervention::STATUS_REASSESSMENT => 'current',
                Intervention::STATUS_COMPLETED => 'done',
                default => 'pending',
            }, 'detail' => $i->reassess_on ? 'previsto para '.$i->reassess_on->format('d/m') : null],
            ['key' => 'compare', 'label' => 'Comparar antes e depois', 'state' => $done($status === Intervention::STATUS_COMPLETED), 'detail' => $status === Intervention::STATUS_COMPLETED ? 'concluída em '.$fmt($i->completed_at) : 'gerado após a reavaliação'],
        ];

        if ($status === Intervention::STATUS_PLANNED) {
            $steps[5]['state'] = 'current';
        }

        return $steps;
    }

    private function event(Intervention $intervention, BiAccessScope $scope, string $type, ?string $description = null, ?array $data = null): void
    {
        $intervention->events()->create([
            'tenant_id' => $intervention->tenant_id,
            'type' => $type,
            'description' => $description,
            'data' => $data,
            'user_id' => $scope->userId ?: null,
            'occurred_at' => now(),
        ]);
    }

    private function isTeacher(BiAccessScope $scope): bool
    {
        return $scope->role === 'professor';
    }

    /** Alunos com matrícula ativa nas turmas do professor (independe do período). @return list<int> */
    private function teacherStudentIds(BiAccessScope $scope): array
    {
        $classIds = $scope->classIds ?: [0];
        $primary = DB::table('enrollments')->where('tenant_id', $scope->tenantId)->whereNull('deleted_at')->where('status', 'active')
            ->whereIn('school_class_id', $classIds)->select('student_id');
        $extra = DB::table('enrollment_school_classes as esc')->join('enrollments as e', 'e.id', '=', 'esc.enrollment_id')
            ->where('e.tenant_id', $scope->tenantId)->whereNull('e.deleted_at')->where('e.status', 'active')
            ->whereIn('esc.school_class_id', $classIds)->select('e.student_id');

        return $primary->union($extra)->pluck('student_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
    }
}
