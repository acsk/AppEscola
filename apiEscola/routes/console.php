<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('exams:release-pending-results')->everyFiveMinutes();
Schedule::command('exams:abandon-timed-out')->everyMinute();
Schedule::command('sanctum:prune-expired --hours=24')->daily();
Schedule::command('ranking:snapshot')->everyTenMinutes()->withoutOverlapping();
Schedule::command('ranking:daily-snapshot')->dailyAt('00:10')->timezone('America/Sao_Paulo')->withoutOverlapping();
Schedule::command('learning:generate')->everyTenMinutes()->withoutOverlapping();
Schedule::command('cora:sync-paid-invoices --environment=prod')
    ->dailyAt('06:15')
    ->withoutOverlapping();
