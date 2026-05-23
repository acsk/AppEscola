<?php

$extraOrigins = array_values(array_filter(array_map(
    'trim',
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))
)));

$localDevPatterns = env('APP_ENV', 'production') === 'local'
    ? [
        '#^http://localhost:\d+$#',
        '#^http://127\.0\.0\.1:\d+$#',
    ]
    : [];

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_unique(array_merge([
        'https://appcurso.com.br',
        'https://www.appcurso.com.br',
        'https://painel.appcurso.com.br',
        'https://api.appcurso.com.br',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:4000',
        'http://127.0.0.1:4000',
        'http://localhost:8081',
        'http://127.0.0.1:8081',
        'http://localhost:8082',
        'http://127.0.0.1:8082',
        'http://localhost:8083',
        'http://127.0.0.1:8083',
        'http://localhost:19006',
        'http://127.0.0.1:19006',
    ], $extraOrigins))),

    'allowed_origins_patterns' => array_merge([
        '#^https://([a-z0-9-]+\.)?appcurso\.com\.br$#',
        '#^http://localhost:(3000|4000|5173|8081|8082|8083|19006)$#',
        '#^http://127\.0\.0\.1:(3000|4000|5173|8081|8082|8083|19006)$#',
    ], $localDevPatterns),

    'allowed_headers' => ['*'],

    'exposed_headers' => [
        'X-API-Version',
        'X-API-Contract-Version',
        'X-Min-Supported-App-Version',
        'X-Recommended-App-Version',
        'X-Force-Relogin',
        'Content-Type',
        'Content-Disposition',
        'X-Carne-Format',
        'X-Carne-Filename',
        'X-Carne-Generated-Count',
        'X-Carne-Error-Count',
        'X-Carne-Errors',
    ],

    'max_age' => 0,

    'supports_credentials' => true,
];
