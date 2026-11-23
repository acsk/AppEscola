<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamAnswer;
use App\Models\ExamAttempt;
use Illuminate\Support\Facades\DB;

/** Apaga as entregas e tentativas em andamento para os alunos poderem fazer o simulado de novo. */
class ExamDeliveryResetService
{
    public function reset(Exam $exam): int
    {
        return DB::transaction(function () use ($exam) {
            $ids = ExamAttempt::query()->where('exam_id', $exam->id)->pluck('id');
            if ($ids->isEmpty()) {
                return 0;
            }

            ExamAnswer::query()->whereIn('attempt_id', $ids)->delete();
            ExamAttempt::query()->whereIn('id', $ids)->delete();

            return $ids->count();
        });
    }
}
