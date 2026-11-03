<?php

namespace App\Services\Bi;

use App\Models\Course;
use App\Models\ExamType;
use App\Models\SchoolClass;
use App\Models\Subject;
use App\Models\User;

/** Contexto inicial das telas do BI: recursos do plano, escopo do usuário e opções de filtro já recortadas. */
class BiMetaService
{
    /**
     * Submenus de "Inteligência Educacional". `implemented` só vira true quando a tela é entregue,
     * para o painel não exibir itens vazios.
     */
    public const SECTIONS = [
        ['key' => 'overview', 'label' => 'Visão geral', 'plan' => BiFeatureGate::PLAN_BASIC, 'implemented' => true],
        ['key' => 'diagnosis', 'label' => 'Diagnóstico pedagógico 360°', 'plan' => BiFeatureGate::PLAN_ADVANCED, 'implemented' => true],
        ['key' => 'students', 'label' => 'Evolução dos alunos', 'plan' => BiFeatureGate::PLAN_BASIC, 'implemented' => true],
        ['key' => 'performance', 'label' => 'Desempenho acadêmico', 'plan' => BiFeatureGate::PLAN_BASIC, 'implemented' => true],
        ['key' => 'classes', 'label' => 'Análise de turmas', 'plan' => BiFeatureGate::PLAN_BASIC, 'implemented' => true],
        ['key' => 'subjects', 'label' => 'Disciplinas e assuntos', 'plan' => BiFeatureGate::PLAN_BASIC, 'implemented' => true],
        ['key' => 'engagement', 'label' => 'Frequência e engajamento', 'plan' => BiFeatureGate::PLAN_ADVANCED, 'implemented' => true],
        ['key' => 'assessments', 'label' => 'Análise de simulados', 'plan' => BiFeatureGate::PLAN_BASIC, 'implemented' => true],
        ['key' => 'exam_prep', 'label' => 'Preparação para concursos', 'plan' => BiFeatureGate::PLAN_ADVANCED, 'implemented' => false],
        ['key' => 'follow_up', 'label' => 'Acompanhamento pedagógico', 'plan' => BiFeatureGate::PLAN_ADVANCED, 'implemented' => true],
        ['key' => 'effectiveness', 'label' => 'Efetividade do ensino', 'plan' => BiFeatureGate::PLAN_ADVANCED, 'implemented' => true],
        ['key' => 'reports', 'label' => 'Relatórios e indicadores', 'plan' => BiFeatureGate::PLAN_BASIC, 'implemented' => false],
        ['key' => 'ai_insights', 'label' => 'Insights com IA', 'plan' => BiFeatureGate::PLAN_ADVANCED, 'implemented' => false],
    ];

    public function __construct(private readonly BiFeatureGate $gate)
    {
    }

    /** @return array<string, mixed> */
    public function build(User $user, BiAccessScope $scope): array
    {
        $features = $this->gate->settings($scope->tenantId);
        $defaults = BiFilters::fromValidated([]);

        return [
            'features' => $features,
            'sections' => array_map(fn (array $section) => [
                'key' => $section['key'],
                'label' => $section['label'],
                'plan' => $section['plan'],
                'available' => $section['implemented'] && $this->gate->allows($features, $section['plan']),
            ], self::SECTIONS),
            'scope' => [
                'role' => $scope->role,
                'tenant_wide' => $scope->isTenantWide(),
            ],
            'defaults' => [
                'from' => $defaults->from->toDateString(),
                'to' => $defaults->to->toDateString(),
                'goal_pct' => (float) config('bi.goal_pct', 70),
                'evolution_threshold_pp' => (float) config('bi.evolution_threshold_pp', 5),
                // Critérios da escola já aplicados (BiController::scope).
                'criteria' => array_map(fn (string $key) => config("bi.{$key}"), array_combine(array_keys(BiCriteria::FIELDS), array_keys(BiCriteria::FIELDS))),
            ],
            'filter_options' => $this->filterOptions($user, $scope),
        ];
    }

    /** @return array<string, mixed> */
    private function filterOptions(User $user, BiAccessScope $scope): array
    {
        $classes = SchoolClass::query()
            ->where('tenant_id', $scope->tenantId)
            ->when(! $scope->isTenantWide(), fn ($q) => $q->whereIn('id', $scope->classIds))
            ->orderByDesc('year')
            ->orderBy('name')
            ->get(['id', 'name', 'course_id', 'year', 'status']);

        $courses = Course::query()
            ->where('tenant_id', $scope->tenantId)
            ->when(! $scope->isTenantWide(), fn ($q) => $q->whereIn('id', $classes->pluck('course_id')->unique()))
            ->orderBy('name')
            ->get(['id', 'name']);

        $subjects = Subject::query()
            ->where('tenant_id', $scope->tenantId)
            ->when(! $scope->isTenantWide(), fn ($q) => $q->whereIn('id', $scope->subjectIds() ?: [0]))
            ->orderBy('name')
            ->get(['id', 'name']);

        $teachers = $scope->isTenantWide()
            ? User::query()
                ->where('tenant_id', $scope->tenantId)
                ->where('role', 'professor')
                ->orderBy('name')
                ->get(['id', 'name'])
            : collect([['id' => $user->id, 'name' => $user->name]]);

        $examTypes = ExamType::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('label')
            ->get(['id', 'slug', 'label']);

        return [
            'courses' => $courses->map(fn ($c) => ['id' => $c->id, 'name' => $c->name])->values(),
            'school_classes' => $classes->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
                'course_id' => $c->course_id,
                'year' => $c->year,
                'status' => $c->status,
            ])->values(),
            'subjects' => $subjects->map(fn ($s) => ['id' => $s->id, 'name' => $s->name])->values(),
            'teachers' => collect($teachers)->map(fn ($t) => ['id' => (int) data_get($t, 'id'), 'name' => data_get($t, 'name')])->values(),
            'exam_types' => $examTypes->map(fn ($t) => ['id' => $t->id, 'slug' => $t->slug, 'label' => $t->label])->values(),
            'school_years' => $classes->pluck('year')->filter()->unique()->sortDesc()->values(),
            'modalities' => [
                ['value' => BiFilters::MODALITY_ONLINE, 'label' => 'Online'],
                ['value' => BiFilters::MODALITY_PRESENCIAL, 'label' => 'Presencial'],
            ],
        ];
    }
}
