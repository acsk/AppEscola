<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'cora' => [
        'base_url' => env('CORA_BASE_URL', 'https://api.cora.com.br'),
        'api_base_url_stage' => env('CORA_API_BASE_URL_STAGE', 'https://api.stage.cora.com.br'),
        'api_base_url_prod' => env('CORA_API_BASE_URL_PROD', 'https://api.cora.com.br'),
        'token' => env('CORA_API_TOKEN'),
        'charges_endpoint' => env('CORA_CHARGES_ENDPOINT', '/v1/charges'),
        'timeout' => (int) env('CORA_TIMEOUT', 20),
        'token_url_stage' => env('CORA_TOKEN_URL_STAGE', 'https://matls-clients.api.stage.cora.com.br/token'),
        'token_url_prod' => env('CORA_TOKEN_URL_PROD', 'https://matls-clients.api.cora.com.br/token'),
        'verify_ssl' => (bool) env('CORA_VERIFY_SSL', true),
        /** GET contract-charges/preview?debug=1 — super_admin sempre; demais usuários se true */
        'contract_charges_debug' => filter_var(env('CORA_CONTRACT_CHARGES_DEBUG', false), FILTER_VALIDATE_BOOLEAN),
    ],

];
