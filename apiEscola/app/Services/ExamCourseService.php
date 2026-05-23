<?php

namespace App\Services;

use App\Models\Course;
use App\Models\Exam;
use Illuminate\Validation\ValidationException;

class ExamCourseService
{
    /**
     * @param  array<int, mixed>  $courseIds
     * @return list<int>
     */
    public function normalizeCourseIds(array $courseIds, ?int $legacyCourseId = null): array
    {
        $ids = collect($courseIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        if ($legacyCourseId !== null && $legacyCourseId > 0) {
            $ids = $ids->push((int) $legacyCourseId)->unique()->values();
        }

        return $ids->all();
    }

    /**
     * @param  array<int, mixed>  $courseIds
     */
    public function sync(Exam $exam, array $courseIds, int $tenantId): void
    {
        $ids = $this->normalizeCourseIds($courseIds);
        $this->assertCoursesBelongToTenant($ids, $tenantId);

        $exam->courses()->sync(
            collect($ids)->mapWithKeys(fn (int $id) => [$id => []])->all()
        );

        $exam->forceFill(['course_id' => $ids[0] ?? null])->save();
    }

    /**
     * @param  list<int>  $courseIds
     */
    public function assertCoursesBelongToTenant(array $courseIds, int $tenantId): void
    {
        if ($courseIds === []) {
            return;
        }

        $valid = Course::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $courseIds)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if (array_diff($courseIds, $valid) !== []) {
            throw ValidationException::withMessages([
                'course_ids' => ['Um ou mais cursos são inválidos para esta escola.'],
            ]);
        }
    }
}
