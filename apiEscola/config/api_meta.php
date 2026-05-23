<?php

return [
    'version' => env('API_VERSION', '1.0.49'),
    'contract_version' => env('API_CONTRACT_VERSION', '2026-05-21'),
    'has_breaking_changes' => (bool) env('API_HAS_BREAKING_CHANGES', false),
    'force_relogin' => (bool) env('API_FORCE_RELOGIN', false),
    'min_supported_app_version' => env('API_MIN_SUPPORTED_APP_VERSION', '1.0.0'),
    'recommended_app_version' => env('API_RECOMMENDED_APP_VERSION', '1.0.0'),
    'changelog_url' => env('API_CHANGELOG_URL', ''),
];
