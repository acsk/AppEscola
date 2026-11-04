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
}
