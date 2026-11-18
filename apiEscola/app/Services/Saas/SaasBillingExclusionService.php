<?php

namespace App\Services\Saas;

use App\Models\SaasBillingExclusion;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use App\Support\GridSearch;

/**
 * Alunos marcados como teste nas configurações da instituição.
 * Eles deixam de contar nos meses de cobrança ainda abertos.
 */
class SaasBillingExclusionService
{
    public function __construct(private readonly SaasAuditService $audit)
    {
    }

    /** @return array{excluded: list<array<string, mixed>>, matches: list<array<string, mixed>>} */
    public function present(Tenant $tenant, string $search): array
    {
        $excludedIds = SaasBillingExclusion::query()
            ->where('tenant_id', $tenant->id)
            ->pluck('student_id');

        $excluded = Student::query()
            ->where('tenant_id', $tenant->id)
            ->whereIn('id', $excludedIds)
            ->orderBy('name')
            ->get(['id', 'name', 'enrollment_number', 'email']);

        $matches = collect();
        $term = trim($search);
        if (mb_strlen($term) >= 2) {
            $query = Student::query()->where('tenant_id', $tenant->id);
            GridSearch::apply($query, $term, ['name', 'enrollment_number', 'email']);
            $matches = $query->orderBy('name')->limit(20)->get(['id', 'name', 'enrollment_number', 'email']);
        }

        return [
            'excluded' => $excluded->map(fn (Student $student) => $this->row($student, true))->values()->all(),
            'matches' => $matches->map(fn (Student $student) => $this->row($student, $excludedIds->contains($student->id)))->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    public function set(Tenant $tenant, Student $student, bool $excluded, ?User $actor): array
    {
        if ($excluded) {
            SaasBillingExclusion::query()->firstOrCreate([
                'tenant_id' => $tenant->id,
                'student_id' => $student->id,
            ]);
        } else {
            SaasBillingExclusion::query()
                ->where('tenant_id', $tenant->id)
                ->where('student_id', $student->id)
                ->delete();
        }

        $this->audit->log(
            $actor,
            $tenant->id,
            $excluded ? 'billing.test_student_excluded' : 'billing.test_student_restored',
            ($excluded ? 'Aluno de teste fora da cobrança: ' : 'Aluno voltou a contar na cobrança: ').$student->name,
        );

        return $this->row($student, $excluded);
    }

    /** @return array<string, mixed> */
    private function row(Student $student, bool $excluded): array
    {
        return [
            'id' => $student->id,
            'name' => $student->name,
            'enrollment_number' => $student->enrollment_number,
            'email' => $student->email,
            'excluded' => $excluded,
        ];
    }
}
