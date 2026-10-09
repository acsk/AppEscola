<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Services\ExamAccessService;
use App\Services\Learning\LearningDiagnosisService;
use App\Services\Learning\LearningRecommendationService;
use App\Services\PracticeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/** Minha Aprendizagem: diagnóstico da primeira tentativa e plano de reforço do próprio aluno. */
class StudentLearningController extends Controller
{
    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly LearningDiagnosisService $diagnosis,
        private readonly LearningRecommendationService $recommendations,
        private readonly PracticeService $practice,
    ) {}

    public function overview(Request $request): JsonResponse
    {
        return $this->success($this->diagnosis->overview($this->student($request)));
    }

    public function topics(Request $request): JsonResponse
    {
        return $this->success($this->diagnosis->topics($this->student($request)));
    }

    public function recommendations(Request $request): JsonResponse
    {
        return $this->success($this->plans($this->student($request)));
    }

    public function evolution(Request $request): JsonResponse
    {
        return $this->success($this->diagnosis->evolution($this->student($request)));
    }

    public function reinforcement(Request $request): JsonResponse
    {
        $student = $this->student($request);
        $data = $request->validate([
            'topic_id' => ['required', 'integer'],
        ]);
        $plan = collect($this->recommendations->recommend($student, 8))
            ->firstWhere('topic_id', (int) $data['topic_id']);
        if (! $plan || $plan['question_ids'] === []) {
            return $this->error('Ainda não há questões deste assunto para praticar.', null, 422);
        }
        $attempt = $this->practice->startWithQuestions(
            $student,
            $plan['question_ids'],
            'Reforço: '.$plan['topic_name'],
            ['topic_ids' => [$plan['topic_id']], 'source' => $plan['source']],
        );

        return $this->created($this->practice->attemptPayload($attempt), $plan['action']);
    }

    private function student(Request $request): Student
    {
        $student = $this->examAccess->resolveActiveStudent($request->user());
        if (! $student) {
            throw new AccessDeniedHttpException('Disponível apenas para alunos ativos.');
        }

        return $student;
    }

    /** @return list<array<string, mixed>> */
    private function plans(Student $student): array
    {
        return array_map(function (array $plan) {
            unset($plan['question_ids']);

            return $plan;
        }, $this->recommendations->recommend($student));
    }
}
