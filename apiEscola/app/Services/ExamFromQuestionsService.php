<?php

namespace App\Services;

use App\Exceptions\QuestionBankException;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\ExamStatus;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

/**
 * Cria um simulado (rascunho) a partir de questões avulsas do banco — usado ao importar uma prova em PDF.
 * As questões são MOVIDAS para o simulado (exam_id + ordem), sem cópia: continuam no banco de questões
 * como "de simulado" e seguem a modalidade do simulado. O simulado só chega ao aluno quando publicado.
 */
class ExamFromQuestionsService
{
    public const ORIGIN_PDF_IMPORT = 'pdf_import';

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
                'origin'         => self::ORIGIN_PDF_IMPORT,
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

    /**
     * Acrescenta questões avulsas ao fim de um simulado importado (conclusão parcial da revisão:
     * o restante da prova entra depois no mesmo simulado).
     *
     * @param  int[]  $questionIds  na ordem desejada
     */
    public function append(Exam $exam, array $questionIds): Exam
    {
        $ids = array_values(array_unique(array_map('intval', $questionIds)));

        return DB::transaction(function () use ($exam, $ids) {
            $questions = ExamQuestion::query()
                ->where('tenant_id', $exam->tenant_id)
                ->whereNull('exam_id')
                ->whereIn('id', $ids)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');
            if ($questions->count() !== count($ids)) {
                throw new QuestionBankException('Há questões que não existem, não são desta escola ou já pertencem a um simulado.');
            }
            $next = (int) ExamQuestion::where('exam_id', $exam->id)->max('order');
            foreach ($ids as $position => $id) {
                $questions[$id]->update(['exam_id' => $exam->id, 'order' => $next + $position + 1, 'exam_type_id' => $exam->exam_type_id]);
            }

            return $exam->load(['examStatus', 'examType'])->loadCount('questions');
        });
    }

    /** Simulados importados de PDF da escola; $status = slug (draft, published…) ou null para todos. */
    public function listImported(int $tenantId, ?string $status, ?string $search, int $perPage = 15): LengthAwarePaginator
    {
        return Exam::query()
            ->where('tenant_id', $tenantId)
            ->where('origin', self::ORIGIN_PDF_IMPORT)
            ->when($status, fn ($q) => $q->whereHas('examStatus', fn ($s) => $s->where('slug', $status)))
            ->when($search, fn ($q) => $q->where('title', 'like', '%'.addcslashes($search, '%_\\').'%'))
            ->with(['examStatus', 'examType'])
            ->withCount(['questions', 'attempts'])
            ->latest('id')
            ->paginate($perPage);
    }

    /**
     * Exclui o simulado (soft delete, como na tela Simulados). Com $keepQuestions, as questões voltam ao
     * banco como avulsas antes; sem isso, somem do banco junto com o simulado.
     * Não devolve questões de simulado já respondido: as respostas dos alunos dependem delas.
     */
    public function delete(Exam $exam, bool $keepQuestions): int
    {
        return DB::transaction(function () use ($exam, $keepQuestions) {
            $detached = 0;
            if ($keepQuestions) {
                if ($exam->attempts()->exists()) {
                    throw new QuestionBankException('Este simulado já foi respondido por alunos; as questões não podem voltar ao banco como avulsas. Exclua sem manter as questões.');
                }
                $detached = $exam->questions()->update(['exam_id' => null]);
            }
            $exam->delete();

            return $detached;
        });
    }
}
