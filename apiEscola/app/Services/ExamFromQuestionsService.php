<?php

namespace App\Services;

use App\Exceptions\QuestionBankException;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\ExamStatus;
use Illuminate\Support\Facades\DB;

/**
 * Cria um simulado (rascunho) a partir de questões avulsas do banco — usado ao importar uma prova em PDF.
 * As questões são MOVIDAS para o simulado (exam_id + ordem), sem cópia: continuam no banco de questões
 * como "de simulado" e seguem a modalidade do simulado. O simulado só chega ao aluno quando publicado.
 */
class ExamFromQuestionsService
{
    public function __construct(private readonly ExamTypeService $examTypes) {}

    /**
     * @param  int[]  $questionIds  na ordem desejada no simulado
     */
    public function create(int $tenantId, string $title, string $examTypeSlug, array $questionIds, ?string $description = null): Exam
    {
        $examType = $this->examTypes->resolveActiveBySlug($examTypeSlug);
        $ids = array_values(array_unique(array_map('intval', $questionIds)));

        return DB::transaction(function () use ($tenantId, $title, $examType, $ids, $description) {
            $questions = ExamQuestion::query()
                ->where('tenant_id', $tenantId)
                ->whereNull('exam_id')
                ->whereIn('id', $ids)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            if ($questions->count() !== count($ids)) {
                throw new QuestionBankException('Há questões que não existem, não são desta escola ou já pertencem a um simulado.');
            }

            $exam = Exam::create([
                'tenant_id'      => $tenantId,
                'title'          => $title,
                'description'    => $description,
                'exam_type_id'   => $examType->id,
                'exam_status_id' => ExamStatus::where('slug', 'draft')->value('id'),
            ]);

            foreach ($ids as $position => $id) {
                $questions[$id]->update([
                    'exam_id'      => $exam->id,
                    'order'        => $position + 1,
                    'exam_type_id' => $examType->id, // questão segue a modalidade do simulado
                ]);
            }

            return $exam->load(['examStatus', 'examType'])->loadCount('questions');
        });
    }
}
