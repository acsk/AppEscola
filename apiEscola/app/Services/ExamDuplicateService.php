<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamStatus;
use Illuminate\Support\Facades\DB;

/** Copia o simulado como rascunho: cursos, questões, alternativas e materiais. Entregas ficam no original. */
class ExamDuplicateService
{
    public function __construct(private readonly ExamCourseService $courses) {}

    public function duplicate(Exam $exam): Exam
    {
        return DB::transaction(function () use ($exam) {
            $exam->load([
                'questions.options',
                'questions.topics:id',
                'questions.tags:id',
                'supportMaterials',
                'courses:id',
            ]);

            $copy = $exam->replicate([
                'created_at', 'updated_at', 'deleted_at',
                'created_by', 'updated_by', 'deleted_by',
            ]);
            $copy->title = $this->copyTitle($exam->title);
            $copy->exam_status_id = ExamStatus::query()->where('slug', 'draft')->value('id');
            $copy->save();

            $this->courses->sync($copy, $exam->linkedCourseIds()->all(), (int) $exam->tenant_id);

            foreach ($exam->questions as $question) {
                $newQuestion = $question->replicate([
                    'created_at', 'updated_at', 'deleted_at',
                    'created_by', 'updated_by', 'deleted_by',
                ]);
                $newQuestion->exam_id = $copy->id;
                $newQuestion->save();

                foreach ($question->options as $option) {
                    $newOption = $option->replicate();
                    $newOption->question_id = $newQuestion->id;
                    $newOption->save();
                }

                $newQuestion->topics()->sync($question->topics->pluck('id')->all());
                $newQuestion->tags()->sync($question->tags->pluck('id')->all());
            }

            foreach ($exam->supportMaterials as $material) {
                $newMaterial = $material->replicate([
                    'created_at', 'updated_at', 'deleted_at',
                    'created_by', 'updated_by', 'deleted_by',
                ]);
                $newMaterial->exam_id = $copy->id;
                $newMaterial->save();
            }

            return $copy->fresh(['course', 'courses', 'subject', 'examStatus', 'examType']);
        });
    }

    private function copyTitle(string $title): string
    {
        $suffix = ' (cópia)';
        $max = 255;

        if (mb_strlen($title.$suffix) <= $max) {
            return $title.$suffix;
        }

        return mb_substr($title, 0, $max - mb_strlen($suffix)).$suffix;
    }
}
