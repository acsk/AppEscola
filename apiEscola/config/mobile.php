<?php

return [
    /*
    | URL do app mobile na web. O super admin abre essa origem, já na conta do aluno.
    | Em produção defina MOBILE_WEB_URL. No ambiente local o padrão é o Expo web.
    */
    'web_url' => rtrim((string) env('MOBILE_WEB_URL', env('APP_ENV') === 'local' ? 'http://localhost:8081' : ''), '/'),
];
