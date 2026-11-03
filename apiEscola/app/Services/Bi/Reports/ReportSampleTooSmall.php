<?php

namespace App\Services\Bi\Reports;

use RuntimeException;

/** Relatório agregado com menos alunos que o mínimo: não é gerado (risco de identificar alguém). */
class ReportSampleTooSmall extends RuntimeException
{
    public function __construct(public readonly int $minGroup)
    {
        parent::__construct("Recorte com menos de {$minGroup} alunos: relatório agregado não é gerado para não identificar ninguém.");
    }
}
