<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * "Hoje" no fuso da operação (config app.business_timezone), à meia-noite no fuso da aplicação.
 *
 * A aplicação roda em UTC: entre 21h e 0h de Brasília o dia UTC já virou, e uma cobrança que
 * vence hoje apareceria como vencida. Use para regras por data (vencida, a vencer, períodos).
 */
final class BusinessDate
{
    public static function today(): Carbon
    {
        $date = Carbon::now(config('app.business_timezone', 'America/Sao_Paulo'))->toDateString();

        return Carbon::parse($date)->startOfDay();
    }

    /**
     * Data/hora vinda de fora, no fuso da aplicação. Só a data ("2026-11-03") é o início do dia no fuso
     * da operação (03:00 UTC), não meia-noite UTC, que em Brasília seria 21h do dia anterior.
     * Com horário e fuso, respeita o fuso informado.
     */
    public static function moment(string $value): Carbon
    {
        $value = trim($value);

        $moment = preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)
            ? Carbon::parse($value, config('app.business_timezone', 'America/Sao_Paulo'))->startOfDay()
            : Carbon::parse($value);

        return $moment->setTimezone(config('app.timezone'));
    }
}
