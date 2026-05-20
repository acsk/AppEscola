<?php

return [
    'types' => [
        'exam' => [
            'label' => 'Simulado',
            'icon'  => 'clipboard',
            'color' => '#F97316',
        ],
        'exam_presential' => [
            'label' => 'Simulado presencial',
            'icon'  => 'school',
            'color' => '#EC4899',
        ],
        'school' => [
            'label' => 'Evento da escola',
            'icon'  => 'business',
            'color' => '#F59E0B',
        ],
        'class' => [
            'label' => 'Aula / turma',
            'icon'  => 'people',
            'color' => '#10B981',
        ],
        'billing' => [
            'label' => 'Cobrança',
            'icon'  => 'receipt',
            'color' => '#EF4444',
        ],
        'task' => [
            'label' => 'Tarefa',
            'icon'  => 'checkbox',
            'color' => '#8B5CF6',
        ],
        'general' => [
            'label' => 'Geral',
            'icon'  => 'calendar',
            'color' => '#64748B',
        ],
    ],

    'audience_types' => [
        'tenant',
        'course',
        'school_class',
        'student',
    ],
];
