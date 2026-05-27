<?php

/**
 * Legado: classificações de prova ficam na tabela `exam_types` (CRUD super admin).
 * Mantido apenas como fallback de label em registros antigos sem FK.
 */
return [
    'material_kinds' => [
        'prova'      => 'Prova',
        'exercicio'  => 'Exercício',
    ],

    'exam_types' => [
        'enem'       => 'ENEM',
        'vestibular' => 'Vestibular',
        'fuvest'     => 'FUVEST',
        'concurso'   => 'Concurso',
        'custom'     => 'Outro',
    ],
];
