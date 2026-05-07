<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => [
        'https://appcurso.com.br',
        'https://www.appcurso.com.br',
        'https://painel.appcurso.com.br',
        'https://api.appcurso.com.br',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:4000',
        'http://localhost:8081',
    ],

    'allowed_origins_patterns' => [
        '#^https://([a-z0-9-]+\.)?appcurso\.com\.br$#',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,
];
