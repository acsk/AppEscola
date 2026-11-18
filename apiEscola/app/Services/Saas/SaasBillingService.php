<?php

namespace App\Services\Saas;

use App\Models\Student;
use Illuminate\Validation\ValidationException;

/**
 * Cobrança SaaS por aluno com acesso ao app.
 * Conta aluno ativo, com usuário ativo, que não esteja com matrícula bloqueada
 * e que não tenha sido marcado como teste nas configurações da instituição.
 */
class SaasBillingService
{
    public function appStudents(int $tenantId): int
    {
        return Student::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->whereNotNull('user_id')
            ->whereHas('user', fn ($q) => $q->where('status', 'active'))
            ->whereDoesntHave('enrollments', fn ($q) => $q->whereNotNull('blocked_at')->where('status', '!=', 'cancelled'))
            ->whereDoesntHave('saasBillingExclusion', fn ($q) => $q->whereColumn('saas_billing_exclusions.tenant_id', 'students.tenant_id'))
            ->count();
    }

    /**
     * Faixas ordenadas, sem sobreposição. A última pode ficar sem data final.
     *
     * @param  array<int, array<string, mixed>>|null  $rows
     * @return array<int, array{from: string, until: string|null, price: string}>|null
     */
    public function normalizeSchedule(?array $rows): ?array
    {
        if ($rows === null || $rows === []) {
            return null;
        }

        $out = [];
        foreach (array_values($rows) as $i => $row) {
            $from = substr((string) ($row['from'] ?? ''), 0, 10);
            $untilRaw = $row['until'] ?? null;
            $until = $untilRaw === null || $untilRaw === '' ? null : substr((string) $untilRaw, 0, 10);
            if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
                throw ValidationException::withMessages(["price_schedule.{$i}.from" => ['Informe a data inicial da faixa.']]);
            }
            if ($until !== null && ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $until)) {
                throw ValidationException::withMessages(["price_schedule.{$i}.until" => ['Data final inválida.']]);
            }
            if ($until !== null && $until < $from) {
                throw ValidationException::withMessages(["price_schedule.{$i}.until" => ['A data final precisa ser igual ou posterior à inicial.']]);
            }
            $out[] = [
                'from' => $from,
                'until' => $until,
                'price' => number_format((float) ($row['price'] ?? 0), 2, '.', ''),
            ];
        }

        usort($out, fn ($a, $b) => strcmp($a['from'], $b['from']));
        for ($i = 1, $n = count($out); $i < $n; $i++) {
            $prevUntil = $out[$i - 1]['until'];
            if ($prevUntil === null || $out[$i]['from'] <= $prevUntil) {
                throw ValidationException::withMessages([
                    'price_schedule' => ['As faixas de preço não podem se sobrepor. A faixa sem data final precisa ser a última.'],
                ]);
            }
        }

        return $out;
    }
}
