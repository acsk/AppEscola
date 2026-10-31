<?php

namespace App\Services\Bi\Sources;

use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiFilters;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Alunos considerados num recorte do BI: matrícula ativa cuja vigência cruza o período,
 * em turma dentro do escopo do usuário e dos filtros (turma, curso, ano letivo, professor).
 * Todas as fontes filtram por estes alunos, então os números das telas batem entre si.
 */
class StudentUniverse
{
    /** @var list<int>|null|false false = ainda não calculado */
    private array|null|false $classIds = false;

    public function __construct(
        public readonly BiAccessScope $scope,
        public readonly BiFilters $filters,
    ) {
    }

    /**
     * Turmas a que o recorte se limita, ou null quando não há restrição de turma.
     *
     * @return list<int>|null
     */
    public function classIds(): ?array
    {
        if ($this->classIds !== false) {
            return $this->classIds;
        }

        $sets = [];
        if (! $this->scope->isTenantWide()) {
            $sets[] = $this->scope->classIds;
        }
        if ($this->filters->schoolClassId !== null) {
            $sets[] = [$this->filters->schoolClassId];
        }
        if ($this->filters->teacherId !== null) {
            $sets[] = BiAccessScope::teacherClassIds($this->filters->teacherId, $this->scope->tenantId);
        }

        $ids = null;
        foreach ($sets as $set) {
            $ids = $ids === null ? $set : array_values(array_intersect($ids, $set));
        }

        return $this->classIds = $ids;
    }

    /** Subconsulta com uma coluna `student_id`, sem repetição. */
    public function query(): Builder
    {
        return $this->memberships()->select('m.student_id')->distinct();
    }

    /**
     * Turmas (nomes) de cada aluno dentro do recorte.
     *
     * @param  list<int>  $studentIds
     * @return array<int, list<string>>
     */
    public function classNamesByStudent(array $studentIds): array
    {
        if ($studentIds === []) {
            return [];
        }

        $names = [];
        $this->memberships()
            ->whereIn('m.student_id', $studentIds)
            ->select('m.student_id', 'sc.name')
            ->distinct()
            ->orderBy('sc.name')
            ->get()
            ->each(function ($row) use (&$names) {
                $names[(int) $row->student_id][] = $row->name;
            });

        return $names;
    }

    /** Matrícula × turma (principal e adicionais) já filtradas pelo recorte. */
    private function memberships(): Builder
    {
        $tenantId = $this->scope->tenantId;
        [$from, $to] = $this->filters->dateRange();

        $active = fn (Builder $q) => $q
            ->where('e.tenant_id', $tenantId)
            ->whereNull('e.deleted_at')
            ->where('e.status', 'active')
            ->where('e.start_date', '<=', $to)
            ->where(fn ($w) => $w->whereNull('e.end_date')->orWhere('e.end_date', '>=', $from));

        $primary = DB::table('enrollments as e')
            ->select('e.student_id', 'e.school_class_id')
            ->tap($active);

        $extra = DB::table('enrollment_school_classes as esc')
            ->join('enrollments as e', 'e.id', '=', 'esc.enrollment_id')
            ->select('e.student_id', 'esc.school_class_id')
            ->tap($active);

        $classIds = $this->classIds();

        return DB::query()
            ->fromSub($primary->union($extra), 'm')
            ->join('school_classes as sc', 'sc.id', '=', 'm.school_class_id')
            ->join('students as s', 's.id', '=', 'm.student_id')
            ->where('sc.tenant_id', $tenantId)
            ->whereNull('sc.deleted_at')
            ->whereNull('s.deleted_at')
            ->when($classIds !== null, fn ($q) => $q->whereIn('m.school_class_id', $classIds ?: [0]))
            ->when($this->filters->courseId !== null, fn ($q) => $q->where('sc.course_id', $this->filters->courseId))
            ->when($this->filters->schoolYear !== null, fn ($q) => $q->where('sc.year', $this->filters->schoolYear));
    }
}
