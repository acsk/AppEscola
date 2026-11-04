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
Schedule::command('bi:refresh-facts')->everyTenMinutes()->withoutOverlapping();
Schedule::command('bi:refresh-facts --full')->dailyAt('03:30')->timezone('America/Sao_Paulo')->withoutOverlapping();
Schedule::command('learning:generate')->everyTenMinutes()->withoutOverlapping();
Schedule::command('questions:index-embeddings --limit=20')->everyFiveMinutes()->withoutOverlapping();
// Avisos do webhook Cora: retoma pendentes, retentativas e processos interrompidos.
Schedule::command('cora:process-webhook-events')->everyMinute()->withoutOverlapping();
Schedule::command('cora:sync-paid-invoices --environment=prod')
    ->dailyAt('06:15')
    ->withoutOverlapping();
// Extrato Cora para a conciliação bancária: busca só o que falta (somente leitura na Cora) e concilia pelo ID do pagamento.
Schedule::command('cora:sync-bank-statement --environment=prod')
    ->cron('20 */3 * * *')
    ->withoutOverlapping();
// Contas a pagar: próximas competências das despesas mensais.
Schedule::command('finance:generate-recurring-expenses')
    ->dailyAt('05:30')
    ->timezone('America/Sao_Paulo')
    ->withoutOverlapping();
