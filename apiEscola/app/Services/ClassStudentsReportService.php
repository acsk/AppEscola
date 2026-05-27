<?php

namespace App\Services;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class ClassStudentsReportService
{
    /**
     * @param array{
     *   school_class_id?: int|null,
     *   course_id?: int|null,
     *   period?: string|null,
     *   weekday?: string|null,
     *   search?: string|null,
     *   per_page?: int|null
     * } $filters
     */
    public function paginate(int $tenantId, array $filters = []): LengthAwarePaginator
    {
        $perPage = min(max((int) ($filters['per_page'] ?? 20), 1), 100);
        $schoolClassId = (int) ($filters['school_class_id'] ?? 0);
        $courseId = (int) ($filters['course_id'] ?? 0);
        $period = trim((string) ($filters['period'] ?? ''));
        $weekday = trim((string) ($filters['weekday'] ?? ''));
        $search = trim((string) ($filters['search'] ?? ''));

        $query = $this->baseQuery();
        $query->where('sc.tenant_id', $tenantId);

        if ($schoolClassId > 0) {
            $query->where('sc.id', $schoolClassId);
        }

        if ($courseId > 0) {
            $query->where('sc.course_id', $courseId);
        }

        if ($period !== '') {
            $query->where('sc.period', $period);
        }

        if ($weekday !== '') {
            $query->whereExists(function ($sub) use ($weekday): void {
                $sub->selectRaw('1')
                    ->from('class_schedules as cs_filter')
                    ->whereColumn('cs_filter.school_class_id', 'sc.id')
                    ->where('cs_filter.weekday', $weekday)
                    ->whereNull('cs_filter.deleted_at');
            });
        }

        if ($search !== '') {
            $term = '%' . $search . '%';
            $query->where(function (Builder $inner) use ($term): void {
                $inner->where('student_name', 'like', $term)
                    ->orWhere('enrollment_number', 'like', $term)
                    ->orWhere('school_class_name', 'like', $term)
                    ->orWhere('class_weekdays', 'like', $term);
            });
        }

        return $query
            ->orderBy('school_class_name')
            ->orderBy('student_name')
            ->paginate($perPage);
    }

    private function baseQuery(): Builder
    {
        if ($this->canUseReportView()) {
            return DB::table('vw_report_class_students as v')
                ->join('school_classes as sc', 'sc.id', '=', 'v.school_class_id')
                ->leftJoinSub($this->scheduleSummarySubquery(), 'cs_sum', 'cs_sum.school_class_id', '=', 'v.school_class_id')
                ->select([
                    'v.tenant_id',
                    'v.school_class_id',
                    'v.school_class_name',
                    'v.course_id',
                    'v.course_name',
                    'v.enrollment_id',
                    'v.enrollment_status',
                    'v.student_id',
                    'v.student_name',
                    'v.enrollment_number',
                    'sc.period as school_class_period',
                    DB::raw('COALESCE(cs_sum.class_weekdays, \'\') as class_weekdays'),
                ]);
        }

        // Fallback para SQLite e também para MySQL quando a VIEW ainda não foi criada.
        return DB::query()
            ->fromSub(function ($q) {
                $q->from('enrollment_school_classes')
                    ->select(['enrollment_id', 'school_class_id'])
                    ->union(
                        DB::table('enrollments')
                            ->selectRaw('id as enrollment_id, school_class_id')
                            ->whereNotNull('school_class_id')
                    );
            }, 'esc')
            ->join('enrollments as e', 'e.id', '=', 'esc.enrollment_id')
            ->join('school_classes as sc', 'sc.id', '=', 'esc.school_class_id')
            ->leftJoin('courses as c', 'c.id', '=', 'sc.course_id')
            ->leftJoinSub($this->scheduleSummarySubquery(), 'cs_sum', 'cs_sum.school_class_id', '=', 'sc.id')
            ->join('students as s', 's.id', '=', 'e.student_id')
            ->whereNull('e.deleted_at')
            ->whereNull('sc.deleted_at')
            ->whereNull('s.deleted_at')
            ->select([
                'esc.school_class_id',
                'sc.tenant_id as tenant_id',
                'sc.name as school_class_name',
                'c.id as course_id',
                'c.name as course_name',
                'e.id as enrollment_id',
                'e.status as enrollment_status',
                's.id as student_id',
                's.name as student_name',
                's.enrollment_number as enrollment_number',
                'sc.period as school_class_period',
                DB::raw('COALESCE(cs_sum.class_weekdays, \'\') as class_weekdays'),
            ]);
    }

    private function scheduleSummarySubquery(): Builder
    {
        return DB::table('class_schedules')
            ->selectRaw('school_class_id, GROUP_CONCAT(DISTINCT weekday ORDER BY weekday SEPARATOR ",") as class_weekdays')
            ->whereNull('deleted_at')
            ->groupBy('school_class_id');
    }

    private function canUseReportView(): bool
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            return false;
        }

        if ($driver !== 'mysql') {
            return true;
        }

        $database = DB::getDatabaseName();
        if (!is_string($database) || $database === '') {
            throw new RuntimeException('Não foi possível identificar o database atual para validar a VIEW de relatório.');
        }

        $row = DB::selectOne(
            'SELECT COUNT(*) AS total FROM information_schema.views WHERE table_schema = ? AND table_name = ?',
            [$database, 'vw_report_class_students']
        );

        return (int) ($row->total ?? 0) > 0;
    }
}
