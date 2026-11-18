<?php

namespace App\Services\Saas;

use App\Models\Student;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
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
     * Estoque de cada mês: quem já tinha matrícula mais quem entrou naquele mês.
     * A entrada é a primeira matrícula. Sem matrícula, vale a data do acesso ao app.
     * Mês futuro repete quem já está hoje.
     *
     * @return array<int, array{total: int, entered: int, already: int, future: bool}>
     */
    public function appStudentsByMonth(int $tenantId, int $year, Carbon $today): array
    {
        $tz = config('app.business_timezone', 'America/Sao_Paulo');
        $todayDate = $today->format('Y-m-d');
        $people = $this->billableTimeline($tenantId, $tz);
        $months = [];

        for ($month = 1; $month <= 12; $month++) {
            $start = sprintf('%04d-%02d-01', $year, $month);
            $end = Carbon::parse($start, $tz)->endOfMonth()->toDateString();
            $future = $start > $todayDate;
            $cutoff = $future ? $todayDate : ($end < $todayDate ? $end : $todayDate);
            $entered = 0;
            $already = 0;

            foreach ($people as $person) {
                if ($person['access'] > $cutoff) {
                    continue;
                }
                if ($person['deleted'] !== null && $person['deleted'] <= $cutoff) {
                    continue;
                }
                if ($person['blocked'] !== null && $person['blocked'] <= $cutoff) {
                    continue;
                }
                if ($future || $person['access'] < $start) {
                    $already++;
                } else {
                    $entered++;
                }
            }

            if ($future) {
                $entered = 0;
            }

            $months[$month] = [
                'total' => $entered + $already,
                'entered' => $entered,
                'already' => $already,
                'future' => $future,
            ];
        }

        return $months;
    }

    /** @return list<array{access: string, deleted: string|null, blocked: string|null}> */
    private function billableTimeline(int $tenantId, string $tz): array
    {
        $blocked = DB::table('enrollments')
            ->select('student_id', DB::raw('MIN(blocked_at) as blocked_at'))
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at')
            ->whereNotNull('blocked_at')
            ->where('status', '!=', 'cancelled')
            ->groupBy('student_id');

        $entries = DB::table('enrollments')
            ->select('student_id', DB::raw('MIN(start_date) as start_date'))
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at')
            ->whereNotNull('start_date')
            ->groupBy('student_id');

        return Student::query()
            ->withTrashed()
            ->where('students.tenant_id', $tenantId)
            ->where('students.status', 'active')
            ->whereNotNull('students.user_id')
            ->join('users', fn ($join) => $join->on('users.id', '=', 'students.user_id')->where('users.status', 'active'))
            ->leftJoinSub($blocked, 'blocks', 'blocks.student_id', '=', 'students.id')
            ->leftJoinSub($entries, 'entries', 'entries.student_id', '=', 'students.id')
            ->whereDoesntHave('saasBillingExclusion', fn ($q) => $q->whereColumn('saas_billing_exclusions.tenant_id', 'students.tenant_id'))
            ->get([
                'students.created_at',
                'students.deleted_at',
                'users.created_at as user_created_at',
                'blocks.blocked_at',
                'entries.start_date',
            ])
            ->map(function ($row) use ($tz) {
                $studentAt = Carbon::parse($row->created_at)->timezone($tz)->toDateString();
                $userAt = Carbon::parse($row->user_created_at)->timezone($tz)->toDateString();
                $access = $studentAt > $userAt ? $studentAt : $userAt;
                if ($row->start_date) {
                    $access = Carbon::parse($row->start_date)->toDateString();
                }

                return [
                    'access' => $access,
                    'deleted' => $row->deleted_at ? Carbon::parse($row->deleted_at)->timezone($tz)->toDateString() : null,
                    'blocked' => $row->blocked_at ? Carbon::parse($row->blocked_at)->timezone($tz)->toDateString() : null,
                ];
            })
            ->all();
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
