<?php

return [
    /** Abaixo disto o assunto fica como "dados insuficientes", sem esconder a recomendação. */
    'min_sample' => (int) env('LEARNING_MIN_SAMPLE', 5),

    /** Limites do aproveitamento na primeira tentativa. O de cima entra na faixa seguinte. */
    'critical_below' => (float) env('LEARNING_CRITICAL_BELOW', 50),
    'attention_below' => (float) env('LEARNING_ATTENTION_BELOW', 70),
    'good_below' => (float) env('LEARNING_GOOD_BELOW', 85),

    /** Dias até a próxima revisão, na ordem. Errar de novo volta para o primeiro. */
    'review_intervals_days' => [1, 3, 7, 15],

    'reinforcement_quantity' => 10,

    /** Lote compartilhado da escola quando o assunto fica sem questão inédita. */
    'generation_batch' => 8,
];
