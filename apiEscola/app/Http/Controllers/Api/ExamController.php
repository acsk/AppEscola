<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExamRequest;
use App\Http\Requests\UpdateExamRequest;
use App\Http\Resources\ExamResource;
use App\Models\Exam;
use App\Models\ExamStatus;
use App\Models\ExamType;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ExamController extends Controller
{
    use ScopedByTenant;

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Exam::with(['course', 'subject', 'examStatus', 'examType']);
        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('status'),     fn ($q, $v) => $q->whereHas('examStatus',  fn ($sq) => $sq->where('slug', $v)))
            ->when($request->query('exam_type'),  fn ($q, $v) => $q->whereHas('examType',    fn ($sq) => $sq->where('slug', $v)))
            ->when($request->query('course_id'),  fn ($q, $v) => $q->where('course_id', $v))
            ->when($request->query('subject_id'), fn ($q, $v) => $q->where('subject_id', $v))
            ->when($request->query('search'),     fn ($q, $v) => $q->where('title', 'like', "%{$v}%"));

        return ExamResource::collection($query->orderByDesc('created_at')->paginate(20));
    }

    public function store(StoreExamRequest $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $data = $request->validated();

        $data['exam_status_id'] = ExamStatus::where('slug', $data['status'] ?? 'draft')->value('id');
        $data['exam_type_id']   = ExamType::where('slug',   $data['exam_type'] ?? 'custom')->value('id');
        unset($data['status'], $data['exam_type']);

        $exam = Exam::create(array_merge($data, ['tenant_id' => $tenantId]));
        $exam->load(['course', 'subject', 'examStatus', 'examType']);

        return $this->created(new ExamResource($exam));
    }

    public function show(Request $request, Exam $exam): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        $exam->load(['course', 'subject', 'examStatus', 'examType', 'questions.options', 'questions.subject']);

        return $this->success(new ExamResource($exam));
    }

    public function update(UpdateExamRequest $request, Exam $exam): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        $data = $request->validated();

        if (isset($data['status'])) {
            $data['exam_status_id'] = ExamStatus::where('slug', $data['status'])->value('id');
            unset($data['status']);
        }
        if (isset($data['exam_type'])) {
            $data['exam_type_id'] = ExamType::where('slug', $data['exam_type'])->value('id');
            unset($data['exam_type']);
        }

        $exam->update($data);
        $exam->load(['course', 'subject', 'examStatus', 'examType']);

        return $this->success(new ExamResource($exam));
    }

    public function destroy(Request $request, Exam $exam): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        // Cascata: questões e opções são removidas via cascadeOnDelete na FK
        $exam->delete();

        return response()->json(['message' => 'Simulado removido com sucesso.']);
    }

    /** Estatísticas agregadas para gráficos: por questão, por matéria, por aluno */
    public function stats(Request $request, Exam $exam): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        $exam->load(['questions.subject', 'questions.answers']);

        $totalAttempts    = $exam->attempts()->where('status', 'completed')->count();
        $avgScore         = $exam->attempts()->where('status', 'completed')->avg('percentage');
        $passCount        = $exam->attempts()
            ->where('status', 'completed')
            ->where('percentage', '>=', $exam->passing_score ?? 0)
            ->count();

        // Acertos por questão
        $questionStats = $exam->questions->map(function ($question) use ($totalAttempts) {
            $correctCount = $question->answers()->where('is_correct', true)->count();
            return [
                'question_id'    => $question->id,
                'question_text'  => substr($question->question_text, 0, 80) . '…',
                'subject'        => $question->subject?->name,
                'correct_count'  => $correctCount,
                'total_answers'  => $question->answers()->count(),
                'hit_rate'       => $totalAttempts > 0
                    ? round(($correctCount / $totalAttempts) * 100, 1)
                    : null,
            ];
        });

        // Desempenho por matéria
        $subjectStats = $questionStats
            ->groupBy('subject')
            ->map(fn ($qs, $subject) => [
                'subject'   => $subject,
                'avg_hit_rate' => round($qs->avg('hit_rate'), 1),
                'questions' => $qs->count(),
            ])->values();

        return response()->json([
            'exam_id'        => $exam->id,
            'total_attempts' => $totalAttempts,
            'avg_percentage' => $avgScore !== null ? round($avgScore, 1) : null,
            'pass_count'     => $passCount,
            'pass_rate'      => $totalAttempts > 0 ? round(($passCount / $totalAttempts) * 100, 1) : null,
            'by_question'    => $questionStats,
            'by_subject'     => $subjectStats,
        ]);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);
        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
