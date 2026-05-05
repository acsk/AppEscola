<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ExamAttemptResource;
use App\Models\Exam;
use App\Models\ExamAnswer;
use App\Models\ExamAttempt;
use App\Models\Student;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExamAttemptController extends Controller
{
    use ScopedByTenant;

    /**
     * Resumo de tentativas agrupadas por status — para o painel administrativo.
     * Útil para mostrar contadores de ação rápida (pendentes de correção, aguardando liberação etc.).
     */
    public function summary(Request $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $counts = ExamAttempt::query()
            ->join('exam_attempt_statuses', 'exam_attempts.attempt_status_id', '=', 'exam_attempt_statuses.id')
            ->when($tenantId, fn ($q) => $q->where('exam_attempts.tenant_id', $tenantId))
            ->selectRaw('exam_attempt_statuses.slug as status, COUNT(*) as total')
            ->groupBy('exam_attempt_statuses.slug')
            ->pluck('total', 'status');

        return $this->success([
            'in_progress'      => (int) ($counts['in_progress']      ?? 0),
            'pending_review'   => (int) ($counts['pending_review']   ?? 0),
            'awaiting_release' => (int) ($counts['awaiting_release'] ?? 0),
            'completed'        => (int) ($counts['completed']        ?? 0),
            'total'            => $counts->sum(),
        ]);
    }

    /** Lista tentativas (admin vê todas; aluno vê apenas as suas) */
    public function index(Request $request)
    {
        $tenantId = $this->getTenantId($request);
        $user     = $request->user();

        $query = ExamAttempt::with(['exam', 'student', 'attemptStatus'])
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->when($request->query('exam_id'),    fn ($q, $v) => $q->where('exam_id', $v))
            ->when($request->query('student_id'), fn ($q, $v) => $q->where('student_id', $v))
            ->when($request->query('status'),     fn ($q, $v) => $q->whereStatus($v));

        return ExamAttemptResource::collection($query->orderByDesc('started_at')->paginate(20));
    }

    /** Inicia uma nova tentativa */
    public function start(Request $request, Exam $exam): JsonResponse
    {
        $user = $request->user();

        // Aluno: deriva o student pelo token. Admin/professor: requer student_id no body.
        if ($user->role === 'aluno') {
            $student = Student::where('user_id', $user->id)
                ->where('status', 'active')
                ->first();

            if (! $student) {
                return $this->forbidden('Aluno não encontrado ou inativo.');
            }
        } else {
            $data    = $request->validate(['student_id' => ['required', 'exists:students,id']]);
            $student = Student::findOrFail($data['student_id']);
        }

        if (!$exam->isPublished()) {
            throw ValidationException::withMessages([
                'exam_id' => ['Este simulado não está disponível para realização.'],
            ]);
        }

        // Bloqueia início após o prazo final do simulado
        if ($exam->ends_at && $exam->ends_at->lt(now())) {
            throw ValidationException::withMessages([
                'exam_id' => ['O prazo para realização deste simulado foi encerrado.'],
            ]);
        }

        // Bloqueia início antes da data de início do simulado
        if ($exam->starts_at && $exam->starts_at->gt(now())) {
            throw ValidationException::withMessages([
                'exam_id' => ['Este simulado ainda não está disponível. Início em: ' . $exam->starts_at->format('d/m/Y H:i') . '.'],
            ]);
        }

        $tenantId = $this->getTenantId($request) ?? $exam->tenant_id;

        // Impede múltiplas tentativas em andamento
        $inProgress = ExamAttempt::where('exam_id', $exam->id)
            ->where('student_id', $student->id)
            ->whereStatus('in_progress')
            ->exists();

        if ($inProgress) {
            throw ValidationException::withMessages([
                'exam_id' => ['Já existe uma tentativa em andamento para este simulado.'],
            ]);
        }

        // Bloqueia nova tentativa enquanto houver resultado aguardando correção manual
        $pendingReview = ExamAttempt::where('exam_id', $exam->id)
            ->where('student_id', $student->id)
            ->whereStatus('pending_review')
            ->exists();

        $awaitingRelease = ExamAttempt::where('exam_id', $exam->id)
            ->where('student_id', $student->id)
            ->whereStatus('awaiting_release')
            ->exists();

        if ($pendingReview || $awaitingRelease) {
            throw ValidationException::withMessages([
                'exam_id' => ['Este simulado já foi entregue e está aguardando liberação do resultado.'],
            ]);
        }

        // Verifica regras de retentativa
        $completedAttempts = ExamAttempt::where('exam_id', $exam->id)
            ->where('student_id', $student->id)
            ->whereStatus('completed')
            ->orderByDesc('finished_at')
            ->get(['id', 'score', 'percentage']);

        if ($completedAttempts->isNotEmpty()) {
            // Simulado já entregue e retentativa não está habilitada
            if (! $exam->allow_retake) {
                throw ValidationException::withMessages([
                    'exam_id' => ['Este simulado já foi entregue e não permite novas tentativas.'],
                ]);
            }

            // Limite de tentativas atingido
            if ($exam->max_attempts !== null && $completedAttempts->count() >= $exam->max_attempts) {
                throw ValidationException::withMessages([
                    'exam_id' => ["Número máximo de tentativas ({$exam->max_attempts}) atingido."],
                ]);
            }

            // Bloqueia se qualquer tentativa já atingiu a nota mínima (irreversível)
            $threshold = $exam->min_score_to_retake ?? $exam->passing_score;

            if ($threshold !== null) {
                $alreadyPassed = $completedAttempts->contains(
                    fn ($a) => (float) $a->percentage >= (float) $threshold
                );

                if ($alreadyPassed) {
                    throw ValidationException::withMessages([
                        'exam_id' => ['Você já foi aprovado neste simulado. Não é possível realizá-lo novamente.'],
                    ]);
                }
            }
        }

        $attempt = ExamAttempt::create([
            'tenant_id'  => $tenantId,
            'exam_id'    => $exam->id,
            'student_id' => $student->id,
            'max_score'  => $exam->totalPoints(),
            'status'     => 'in_progress',
        ]);

        // Retorna as questões SEM gabarito (options sem is_correct)
        $attempt->load(['exam.questions.options', 'student', 'attemptStatus']);

        return response()->json(new ExamAttemptResource($attempt), 201);
    }

    /** Salva ou atualiza uma resposta dentro da tentativa */
    public function answer(Request $request, ExamAttempt $attempt): JsonResponse
    {
        if ($attempt->status !== 'in_progress') {
            throw ValidationException::withMessages([
                'attempt_id' => ['Esta tentativa já foi finalizada.'],
            ]);
        }

        $data = $request->validate([
            'question_id'  => ['required', 'exists:exam_questions,id'],
            'option_id'    => ['nullable', 'exists:exam_question_options,id'],
            'text_answer'  => ['nullable', 'string'],
        ]);

        ExamAnswer::updateOrCreate(
            ['attempt_id' => $attempt->id, 'question_id' => $data['question_id']],
            ['option_id'   => $data['option_id'] ?? null,
             'text_answer' => $data['text_answer'] ?? null]
        );

        return response()->json(['message' => 'Resposta salva.']);
    }

    /** Finaliza a tentativa e calcula a pontuação (questões objetivas) */
    public function finish(Request $request, ExamAttempt $attempt): JsonResponse
    {
        if ($attempt->status !== 'in_progress') {
            throw ValidationException::withMessages([
                'attempt_id' => ['Esta tentativa já foi finalizada.'],
            ]);
        }

        DB::transaction(function () use ($attempt) {
            $totalScore = 0;
            $exam = $attempt->exam()->first(['id', 'ends_at', 'release_results_after_end']);

            $answers = $attempt->answers()->with('question.options')->get();

            foreach ($answers as $answer) {
                $question = $answer->question;

                // Verifica se a opção selecionada exige entrada de texto (triggers_text_input)
                $selectedOption      = $answer->option_id
                    ? $question->options->firstWhere('id', $answer->option_id)
                    : null;
                $selectedTriggersText = (bool) ($selectedOption?->triggers_text_input ?? false);

                // Questões objetivas puras (sem allow_text_answer e sem triggers_text_input):
                // corrige automaticamente. Qualquer variação com texto exige correção manual.
                if (
                    $question->type === 'multiple_choice'
                    && ! $question->allow_text_answer
                    && ! $selectedTriggersText
                    && $answer->option_id
                ) {
                    $isCorrect = $question->options
                        ->where('id', $answer->option_id)
                        ->where('is_correct', true)
                        ->isNotEmpty();

                    $earned = $isCorrect ? (float) $question->points : 0;
                    $answer->update(['is_correct' => $isCorrect, 'points_earned' => $earned]);
                    $totalScore += $earned;
                }
                // Questões discursivas, allow_text_answer ou triggers_text_input ficam is_correct = null
                // → aguardam correção manual do admin
            }

            // Verifica se há respostas pendentes de correção manual
            $hasPending = $attempt->answers()->whereNull('is_correct')->exists();

            $maxScore   = (float) $attempt->max_score ?: 1;
            $percentage = round(($totalScore / $maxScore) * 100, 2);

            $attempt->update([
                'status'      => $hasPending ? 'pending_review' : $this->resolveReleasedStatus($exam),
                'finished_at' => now(),
                'score'       => $totalScore,
                'percentage'  => $hasPending ? null : $percentage,
            ]);
        });

        $attempt->load(['exam', 'student', 'answers', 'attemptStatus']);

        return response()->json(new ExamAttemptResource($attempt));
    }

    /** Corrige manualmente uma resposta de questão discursiva ou allow_text_answer (admin) */
    public function correctAnswer(Request $request, ExamAttempt $attempt, ExamAnswer $answer): JsonResponse
    {
        if ($attempt->status !== 'pending_review') {
            throw ValidationException::withMessages([
                'attempt_id' => ['Esta tentativa não está aguardando correção.'],
            ]);
        }

        if ($answer->attempt_id !== $attempt->id) {
            return $this->forbidden('Esta resposta não pertence à tentativa informada.');
        }

        $question = $answer->question;
        $maxPoints = (float) $question->points;

        $data = $request->validate([
            'is_correct'    => ['required', 'boolean'],
            'points_earned' => ['nullable', 'numeric', 'min:0', 'max:' . $maxPoints],
        ]);

        $isCorrect    = (bool) $data['is_correct'];
        $pointsEarned = isset($data['points_earned'])
            ? (float) $data['points_earned']
            : ($isCorrect ? $maxPoints : 0.0);

        $answer->update([
            'is_correct'    => $isCorrect,
            'points_earned' => $pointsEarned,
        ]);

        // Verifica se ainda há respostas pendentes
        $pendingCount = $attempt->answers()->whereNull('is_correct')->count();

        if ($pendingCount === 0) {
            // Todas corrigidas → recalcula e libera resultado
            $totalScore = (float) $attempt->answers()->sum('points_earned');
            $maxScore   = (float) $attempt->max_score ?: 1;
            $percentage = round(($totalScore / $maxScore) * 100, 2);
            $exam = $attempt->exam()->first(['id', 'ends_at', 'release_results_after_end']);

            $attempt->update([
                'status'     => $this->resolveReleasedStatus($exam),
                'score'      => $totalScore,
                'percentage' => $percentage,
            ]);
        }

        $attempt->load(['exam', 'student', 'answers', 'attemptStatus']);

        return response()->json(new ExamAttemptResource($attempt));
    }

    /** Exibe resultado detalhado de uma tentativa */
    public function show(Request $request, ExamAttempt $attempt): JsonResponse
    {
        $attempt->load(['exam.questions.options', 'student', 'answers', 'attemptStatus']);

        return response()->json(new ExamAttemptResource($attempt));
    }

    /** Ranking dos alunos no simulado (para gráficos) */
    public function ranking(Request $request, Exam $exam): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $attempts = ExamAttempt::with('student:id,name,enrollment_number')
            ->where('exam_id', $exam->id)
            ->whereStatus('completed')
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->orderByDesc('percentage')
            ->get(['id', 'student_id', 'score', 'max_score', 'percentage', 'finished_at']);

        return response()->json([
            'exam_id' => $exam->id,
            'ranking' => $attempts->map(fn ($a, $i) => [
                'position'         => $i + 1,
                'student_id'       => $a->student_id,
                'student_name'     => $a->student?->name,
                'enrollment_number'=> $a->student?->enrollment_number,
                'score'            => (float) $a->score,
                'max_score'        => (float) $a->max_score,
                'percentage'       => (float) $a->percentage,
                'finished_at'      => $a->finished_at?->toISOString(),
            ]),
        ]);
    }

    private function resolveReleasedStatus(?Exam $exam): string
    {
        if (
            $exam?->release_results_after_end
            && $exam->ends_at
            && $exam->ends_at->isFuture()
        ) {
            return 'awaiting_release';
        }

        return 'completed';
    }
}
