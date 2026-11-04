<?php

return [
    /*
     * Preço estimado dos modelos de IA em USD por 1 milhão de tokens (entrada, saída), para o custo estimado
     * quando o provedor não informa o custo real. Chave = nome do modelo (prefixo também vale: "openai/gpt-4.1").
     * Revise junto com a tabela do provedor; modelo sem preço fica sem estimativa.
     */
    'ai_prices' => [
        'openai/gpt-4.1-mini' => [0.40, 1.60],
        'openai/gpt-4.1' => [2.00, 8.00],
        'openai/gpt-4o-mini' => [0.15, 0.60],
        'openai/gpt-4o' => [2.50, 10.00],
        'gpt-4.1-mini' => [0.40, 1.60],
        'gpt-4.1' => [2.00, 8.00],
        'gpt-4o-mini' => [0.15, 0.60],
        'gpt-4o' => [2.50, 10.00],
        'google/gemini-2.5-flash' => [0.30, 2.50],
        'google/gemini-2.5-pro' => [1.25, 10.00],
        'anthropic/claude-sonnet-4' => [3.00, 15.00],
    ],

    /* Alerta de consumo elevado de IA: custo do mês por tenant (USD) acima disto aparece no monitoramento. */
    'ai_cost_alert_usd' => (float) env('SAAS_AI_COST_ALERT_USD', 20),

    /* Diretórios de cada tenant medidos pelo saas:measure-storage (disco do tenant; {base} = base_path das uploads). */
    'storage_paths' => [
        'questions' => ['{base}/exams/{tenant}', '{base}/question-bank/{tenant}'],
        'students' => ['{base}/students/{tenant}'],
        'materials' => ['{base}/past-exams/{tenant}'],
        'institution' => ['{base}/tenants/{tenant}'],
    ],
    /* Diretórios no disco privado (local). */
    'private_storage_paths' => [
        'finance' => ['expenses/{tenant}'],
    ],
];
