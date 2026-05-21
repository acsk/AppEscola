<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Asaas API (https://docs.asaas.com/reference/comece-por-aqui)
    |--------------------------------------------------------------------------
    |
    | Sandbox: https://api-sandbox.asaas.com/v3
    | Produção: https://api.asaas.com/v3
    |
    */

    'api_key' => env('ASAAS_API_KEY'),

    'base_url' => env('ASAAS_BASE_URL', 'https://api-sandbox.asaas.com/v3'),

    'webhook_token' => env('ASAAS_WEBHOOK_TOKEN'),

    'timeout' => (int) env('ASAAS_TIMEOUT', 25),

    'retry' => [
        'times' => (int) env('ASAAS_RETRY_TIMES', 3),
        'sleep_ms' => (int) env('ASAAS_RETRY_SLEEP_MS', 500),
    ],

    'user_agent' => env('ASAAS_USER_AGENT', 'AppEscola/1.0'),

    'environment_urls' => [
        'stage' => 'https://api-sandbox.asaas.com/v3',
        'sandbox' => 'https://api-sandbox.asaas.com/v3',
        'prod' => 'https://api.asaas.com/v3',
        'production' => 'https://api.asaas.com/v3',
    ],

];
