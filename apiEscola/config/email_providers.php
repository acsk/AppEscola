<?php

return [
    /* Provedores disponíveis para os tenants (chave => classe que implementa EmailProvider). */
    'providers' => [
        'resend' => App\Services\Email\Providers\ResendEmailProvider::class,
    ],

    'resend' => [
        'base_url' => env('RESEND_BASE_URL', 'https://api.resend.com'),
        'timeout' => (int) env('RESEND_TIMEOUT', 15),
    ],
];
