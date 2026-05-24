<?php

namespace App\Services;

use App\Models\ExamType;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ExamTypeService
{
    public function resolveActiveBySlug(string $slug): ExamType
    {
        $type = ExamType::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->first();

        if (! $type) {
            throw ValidationException::withMessages([
                'exam_type' => ['Classificação de prova inválida ou inativa.'],
            ]);
        }

        return $type;
    }

    public function generateUniqueSlug(string $label, ?int $ignoreId = null): string
    {
        $base = Str::slug($label);
        if ($base === '') {
            $base = 'tipo';
        }

        $slug = $base;
        $suffix = 2;

        while ($this->slugExists($slug, $ignoreId)) {
            $slug = $base.'-'.$suffix;
            $suffix++;
        }

        return $slug;
    }

    public function assertCanDelete(ExamType $examType): void
    {
        if ($examType->exams()->exists()) {
            throw ValidationException::withMessages([
                'exam_type' => ['Não é possível remover: existem simulados usando esta classificação.'],
            ]);
        }

        if ($examType->pastExams()->exists()) {
            throw ValidationException::withMessages([
                'exam_type' => ['Não é possível remover: existem provas anteriores usando esta classificação.'],
            ]);
        }

        if ($examType->questions()->exists()) {
            throw ValidationException::withMessages([
                'exam_type' => ['Não é possível remover: existem questões usando esta classificação.'],
            ]);
        }
    }

    private function slugExists(string $slug, ?int $ignoreId): bool
    {
        return ExamType::query()
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->where('slug', $slug)
            ->exists();
    }
}
