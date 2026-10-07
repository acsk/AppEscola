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

    'marketing_email' => [
        'provider' => env('MARKETING_EMAIL_PROVIDER', 'resend'),
    ],

    'resend_marketing' => [
        'key' => env('RESEND_MARKETING_API_KEY'),
        'base_url' => env('RESEND_MARKETING_BASE_URL', 'https://api.resend.com'),
        'timeout' => (int) env('RESEND_MARKETING_TIMEOUT', 15),
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

    /**
     * IA (banco de questões). As chaves do .env são usadas só pelo super admin;
     * tenants usam as próprias chaves em tenant_ai_credentials.
     */
    'ai' => [
        'preferred_provider' => env('AI_PREFERRED_PROVIDER', 'openrouter'),
        'timeout' => (int) env('AI_TIMEOUT', 90),
        'images' => [
            'vision_model' => env('OPENROUTER_VISION_MODEL', 'openai/gpt-4o-mini'),
            'model' => env('OPENROUTER_IMAGE_MODEL', 'google/gemini-3.1-flash-image-preview'),
            'allow_paid_primary' => filter_var(env('IMAGE_ALLOW_PAID_PRIMARY', true), FILTER_VALIDATE_BOOLEAN),
            'vision_free_fallbacks' => array_filter(explode(',', (string) env('OPENROUTER_VISION_FREE_FALLBACKS', ''))),
            'free_fallbacks' => array_filter(explode(',', (string) env('OPENROUTER_IMAGE_FREE_FALLBACKS', ''))),
            'validate' => filter_var(env('IMAGE_MULTIMODAL_VALIDATION', true), FILTER_VALIDATE_BOOLEAN),
            'max_retries' => max(0, min(3, (int) env('IMAGE_GENERATION_MAX_RETRIES', 2))),
            'timeout' => max(30, min(180, (int) env('IMAGE_GENERATION_TIMEOUT', 120))),
            'max_bytes' => 5 * 1024 * 1024,
            'max_dimension' => 4096,
        ],
        /** Importação de PDF: o arquivo vai inteiro para um modelo multimodal (a IA lê texto e figuras). */
        'pdf' => [
            'model_openrouter' => env('OPENROUTER_PDF_MODEL', 'google/gemini-2.5-flash'),
            // Separação do texto extraído do PDF: saída estruturada longa (dezenas de questões) — modelo
            // mais capaz que o de texto padrão. Só OpenRouter; chave OpenAI usa o modelo da credencial.
            'text_model_openrouter' => env('OPENROUTER_PDF_TEXT_MODEL', 'google/gemini-2.5-flash'),
            'timeout' => max(60, min(300, (int) env('AI_PDF_TIMEOUT', 180))),
            'max_questions' => 50,
        ],
        'openrouter' => [
            'api_key' => env('OPENROUTER_API_KEY'),
            'base_url' => env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
            'model' => env('OPENROUTER_MODEL', 'openai/gpt-4o-mini'),
        ],
        'openai' => [
            'api_key' => env('OPENAI_API_KEY'),
            'base_url' => env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
            'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
        ],
    ],

];
