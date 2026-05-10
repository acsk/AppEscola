<?php

return [

    'panel' => [
        'version'      => (int) env('APP_PANEL_VERSION', 1),
        'release'      => (int) env('APP_PANEL_RELEASE', 0),
        'release_date' => env('APP_PANEL_RELEASE_DATE', '2026-05-10'),
    ],

    'mobile' => [
        'version'      => (int) env('APP_MOBILE_VERSION', 1),
        'release'      => (int) env('APP_MOBILE_RELEASE', 0),
        'release_date' => env('APP_MOBILE_RELEASE_DATE', '2026-05-10'),
    ],

];
