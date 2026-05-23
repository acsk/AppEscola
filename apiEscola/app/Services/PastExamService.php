<?php

namespace App\Services;

use App\Models\Course;
use App\Models\PastExam;
use App\Models\Subject;
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
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function validateRelations(array $data, int $tenantId): array
    {
        if (isset($data['course_id']) && $data['course_id'] !== null) {
            $valid = Course::query()
                ->where('tenant_id', $tenantId)
                ->whereKey((int) $data['course_id'])
                ->exists();

            if (! $valid) {
                throw ValidationException::withMessages([
                    'course_id' => ['Curso inválido para esta escola.'],
                ]);
            }
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

        return $data;
    }
}
