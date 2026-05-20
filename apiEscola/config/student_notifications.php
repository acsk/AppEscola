<?php

return [
    'types' => [
        'general' => [
            'label' => 'Comunicado geral',
            'icon'  => 'megaphone',
        ],
        'class_announcement' => [
            'label' => 'Aviso da turma',
            'icon'  => 'groups',
        ],
        'billing_due' => [
            'label' => 'Vencimento de cobrança',
            'icon'  => 'receipt',
        ],
        'exam_pending' => [
            'label' => 'Simulado pendente',
            'icon'  => 'assignment',
        ],
        'exam_result' => [
            'label' => 'Resultado do simulado',
            'icon'  => 'grade',
        ],
    ],

    'audience_types' => [
        'tenant',
        'course',
        'school_class',
        'student',
        'students',
    ],

    /** Mapeamento tipo de notificação → tipo no calendário */
    'calendar_type_map' => [
        'general'            => 'general',
        'class_announcement' => 'class',
        'billing_due'        => 'billing',
        'exam_pending'       => 'exam',
        'exam_result'        => 'exam',
    ],

    /** Tipos que podem usar "Exibir no calendário" quando o tenant não personalizou */
    'calendar_defaults' => [
        'enabled_types' => [
            'general',
            'class_announcement',
            'billing_due',
            'exam_pending',
            'exam_result',
        ],
    ],
];
