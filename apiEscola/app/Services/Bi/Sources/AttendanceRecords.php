<?php

namespace App\Services\Bi\Sources;

use App\Services\Bi\BiFilters;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Chamadas lançadas. Frequência = (presente + atrasado) ÷ (presente + atrasado + falta);
 * falta justificada fica fora do denominador e aula sem chamada não entra.
 */
class AttendanceRecords
{
    public function query(StudentUniverse $universe, ?BiFilters $filters = null): Builder
    {
        $filters ??= $universe->filters;
        $classIds = $universe->classIds();

        return DB::table('student_attendances as sa')
            ->where('sa.tenant_id', $universe->scope->tenantId)
            ->whereNull('sa.deleted_at')
            ->whereBetween('sa.attendance_date', $filters->dateRange())
            ->whereIn('sa.status', ['present', 'late', 'absent'])
            ->whereIn('sa.student_id', $universe->query())
            ->when($classIds !== null, fn ($q) => $q->whereIn('sa.school_class_id', $classIds ?: [0]));
    }

    /** @return array{records: int, present: int, students: int} */
    public function totals(StudentUniverse $universe, ?BiFilters $filters = null): array
    {
        $row = $this->query($universe, $filters)
            ->selectRaw('COUNT(*) as records')
            ->selectRaw("SUM(CASE WHEN sa.status IN ('present', 'late') THEN 1 ELSE 0 END) as present")
            ->selectRaw('COUNT(DISTINCT sa.student_id) as students')
            ->first();

        return [
            'records' => (int) ($row->records ?? 0),
            'present' => (int) ($row->present ?? 0),
            'students' => (int) ($row->students ?? 0),
        ];
    }

    /** @return Collection<int, object{records: int, present: int}> por student_id */
    public function byStudent(StudentUniverse $universe, ?BiFilters $filters = null): Collection
    {
        return $this->query($universe, $filters)
            ->groupBy('sa.student_id')
            ->select('sa.student_id')
            ->selectRaw('COUNT(*) as records')
            ->selectRaw("SUM(CASE WHEN sa.status IN ('present', 'late') THEN 1 ELSE 0 END) as present")
            ->get()
            ->keyBy('student_id');
    }
}
