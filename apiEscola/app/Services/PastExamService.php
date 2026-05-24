<?php

namespace App\Services;

use App\Models\Course;
use App\Models\PastExam;
use App\Models\Subject;
use App\Support\StrictIntegerId;
use Illuminate\Validation\ValidationException;

class PastExamService
{
    public function assertBelongsToTenant(PastExam $pastExam, int $tenantId): void
    {
        if ((int) $pastExam->tenant_id !== $tenantId) {
            abort(404);
        }
    }

    /**
     * @param  array<int, mixed>  $courseIds
     * @return list<int>
     */
    public function normalizeCourseIds(array $courseIds, ?int $legacyCourseId = null): array
    {
        $ids = collect(StrictIntegerId::parsePositiveList($courseIds));

        if ($legacyCourseId !== null && $legacyCourseId > 0) {
            $ids = $ids->push($legacyCourseId)->unique()->values();
        }

        return $ids->all();
    }

    /**
     * @param  array<int, mixed>  $courseIds
     */
    public function syncCourses(PastExam $pastExam, array $courseIds, int $tenantId): void
    {
        $ids = $this->normalizeCourseIds($courseIds);
        $this->assertCoursesBelongToTenant($ids, $tenantId);

        $pastExam->courses()->sync(
            collect($ids)->mapWithKeys(fn (int $id) => [$id => []])->all()
        );

        $pastExam->forceFill(['course_id' => $ids[0] ?? null])->save();
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

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function validateRelations(array $data, int $tenantId): array
    {
        if (array_key_exists('course_ids', $data)) {
            $this->assertCoursesBelongToTenant(
                $this->normalizeCourseIds($data['course_ids'] ?? []),
                $tenantId
            );
        } elseif (isset($data['course_id']) && $data['course_id'] !== null) {
            $legacyCourseId = StrictIntegerId::parsePositive($data['course_id']);
            if ($legacyCourseId === null) {
                throw ValidationException::withMessages([
                    'course_id' => ['Curso inválido para esta escola.'],
                ]);
            }
            $this->assertCoursesBelongToTenant([$legacyCourseId], $tenantId);
        }

        if (isset($data['subject_id']) && $data['subject_id'] !== null) {
            $valid = Subject::query()
                ->where('tenant_id', $tenantId)
                ->whereKey((int) $data['subject_id'])
                ->exists();

            if (! $valid) {
                throw ValidationException::withMessages([
                    'subject_id' => ['Disciplina inválida para esta escola.'],
                ]);
            }
        }

        return $this->applyExamScheduleFields($data);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function applyExamScheduleFields(array $data): array
    {
        if (! empty($data['exam_date'])) {
            $parsed = \Illuminate\Support\Carbon::parse($data['exam_date']);
            $data['exam_date'] = $parsed->toDateString();
            $data['exam_year'] = (int) $parsed->format('Y');
        }

        return $data;
    }
}
