<?php

return [
    /** Papéis com acesso ao BI pedagógico. Professor vê apenas as próprias turmas. */
    'roles' => ['super_admin', 'admin', 'coordenador', 'professor'],

    /** Papéis com visão do tenant inteiro (os demais ficam restritos às turmas que lecionam). */
    'tenant_wide_roles' => ['super_admin', 'admin', 'coordenador'],

    /** Plano aplicado quando o tenant não configurou `bi.plan` em tenant_settings. */
    'default_plan' => env('BI_DEFAULT_PLAN', 'advanced'),

    /** Meta padrão de aproveitamento (%), usada até o tenant cadastrar metas próprias. */
    'goal_pct' => (float) env('BI_GOAL_PCT', 70),

    /** Variação mínima (p.p.) para considerar evolução positiva ou queda. */
    'evolution_threshold_pp' => (float) env('BI_EVOLUTION_THRESHOLD_PP', 5),

    /** Frequência abaixo disto (%) sinaliza reforço, com ao menos 4 chamadas no período. */
    'attendance_alert_below' => (float) env('BI_ATTENDANCE_ALERT_BELOW', 75),

    /** Avaliações mínimas do aluno para entrar em média individual ou evolução. */
    'min_student_results' => 2,

    /** Respostas mínimas do aluno numa disciplina para contar como "avaliado". */
    'min_subject_student_answers' => 10,

    /** Janela de "atividade recente", terminando no fim do período. */
    'recent_activity_days' => 14,

    /** Período padrão quando o filtro não informa datas. */
    'default_period_days' => 90,

    /** Maior intervalo aceito nos filtros. */
    'max_period_days' => 731,

    'cache_ttl_seconds' => 600,
];
