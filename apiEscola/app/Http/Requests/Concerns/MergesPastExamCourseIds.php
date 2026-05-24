<?php

namespace App\Http\Requests\Concerns;

use App\Rules\StrictPositiveInteger;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Mescla course_id legado em course_ids sem converter tipos inválidos (ex.: bool → 1).
 *
 * @mixin FormRequest
 */
trait MergesPastExamCourseIds
{
    protected function mergePastExamCourseIds(bool $onlyWhenPresent = false): void
    {
        if ($onlyWhenPresent && ! $this->exists('course_ids') && ! $this->filled('course_id')) {
            return;
        }

        $rawIds = $this->input('course_ids');

        if ($rawIds !== null && ! is_array($rawIds)) {
            return;
        }

        $courseIds = is_array($rawIds) ? $rawIds : [];

        if ($this->filled('course_id')) {
            $courseIds[] = $this->input('course_id');
        }

        $this->merge([
            'course_ids' => array_values($courseIds),
        ]);
    }

    /** @return list<StrictPositiveInteger|string> */
    protected function pastExamCourseIdItemRules(): array
    {
        return [new StrictPositiveInteger, 'exists:courses,id'];
    }

    /** @return list<StrictPositiveInteger|string> */
    protected function pastExamLegacyCourseIdRules(): array
    {
        return ['nullable', new StrictPositiveInteger, 'exists:courses,id'];
    }
}
