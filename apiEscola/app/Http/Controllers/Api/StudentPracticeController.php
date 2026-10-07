<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PracticeAttempt;
use App\Models\Student;
use App\Services\ExamAccessService;
use App\Services\PracticePerformanceService;
use App\Services\PracticeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/** Banco de questões no app do aluno: prática avulsa, simulados do banco, desempenho e ranking de participação. */
class StudentPracticeController extends Controller
{
    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly PracticeService $practice,
        private readonly PracticePerformanceService $performance,
    ) {}

    public function filters(Request $request): JsonResponse
    {
        return $this->success($this->practice->filters($this->student($request)));
    }

    public function nextQuestion(Request $request): JsonResponse
    {
        $student = $this->student($request);
        $filters = $request->validate([
            'subject_id'    => ['nullable', 'integer'],
            'topic_id'      => ['nullable', 'integer'],
            'difficulty_id' => ['nullable', 'integer'],
            'exclude_id'    => ['nullable', 'integer'],
        ]);
        $question = $this->practice->nextQuestion($student, $filters);

        return $question
            ? $this->success($this->practice->questionPayload($question))
            : $this->success(null, 'Nenhuma questão disponível com esses filtros.');
    }

    public function answerQuestion(Request $request, int $question): JsonResponse
    {
        $student = $this->student($request);
        $data = $request->validate(['option_id' => ['required', 'integer']], [], ['option_id' => 'alternativa']);
        $feedback = $this->practice->answerQuestion($student, $question, (int) $data['option_id']);

        return $this->success($feedback, $feedback['is_correct'] ? 'Resposta correta!' : 'Resposta incorreta.');
    }

    public function sets(Request $request): JsonResponse
    {
        return $this->success($this->practice->publishedSets($this->student($request)));
    }

    public function startSet(Request $request, int $set): JsonResponse
    {
        $attempt = $this->practice->startSet($this->student($request), $set);

        return $this->success($this->practice->attemptPayload($attempt));
    }

    public function showAttempt(Request $request, int $attempt): JsonResponse
    {
        return $this->success($this->practice->attemptPayload($this->attempt($request, $attempt)));
    }

    public function answerInAttempt(Request $request, int $attempt): JsonResponse
    {
        $model = $this->attempt($request, $attempt);
        $data = $request->validate([
            'question_id' => ['required', 'integer'],
            'option_id'   => ['required', 'integer'],
        ], [], ['question_id' => 'questão', 'option_id' => 'alternativa']);
        $this->practice->answerInAttempt($model, (int) $data['question_id'], (int) $data['option_id']);

        return $this->success($this->practice->attemptSummary($model), 'Resposta salva.');
    }

    public function finishAttempt(Request $request, int $attempt): JsonResponse
    {
        $model = $this->practice->finishAttempt($this->attempt($request, $attempt));

        return $this->success($this->practice->attemptPayload($model), "Simulado finalizado: {$model->correct_count} de {$model->question_count} acertos.");
    }

    public function summary(Request $request): JsonResponse
    {
        return $this->success($this->practice->summary($this->student($request)));
    }

    public function performance(Request $request): JsonResponse
    {
        return $this->success($this->performance->performance($this->student($request)));
    }

    public function ranking(Request $request): JsonResponse
    {
        $student = $this->student($request);
        $data = $request->validate(['period' => ['nullable', Rule::in(PracticePerformanceService::PERIODS)]]);

        return $this->success($this->performance->ranking(
            (int) $student->tenant_id,
            $data['period'] ?? 'month',
            20,
            $student->id,
        ));
    }

    private function student(Request $request): Student
    {
        $student = $this->examAccess->resolveActiveStudent($request->user());
        if (! $student) {
            throw new AccessDeniedHttpException('Disponível apenas para alunos ativos.');
        }

        return $student;
    }

    private function attempt(Request $request, int $id): PracticeAttempt
    {
        return PracticeAttempt::query()->where('student_id', $this->student($request)->id)->findOrFail($id);
    }
}
