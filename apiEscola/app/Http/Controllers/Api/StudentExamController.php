<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ExamAttemptResource;
use App\Http\Resources\ExamResource;
use App\Models\Exam;
use App\Models\ExamAttempt;
use App\Models\Student;
use App\Services\ExamAccessService;
use App\Services\ExamAttemptIntegrityService;
use App\Services\StudentEnrollmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class StudentExamController extends Controller
{
    public function __construct(
        private readonly StudentEnrollmentService $enrollmentService,
        private readonly ExamAttemptIntegrityService $integrity,
        private readonly ExamAccessService $examAccess,
    ) {
    }

    /**
     * Lista os simulados disponíveis para o aluno autenticado.
     *
     * Critérios:
     *  - Usuário deve ter role 'aluno'
     *  - Deve existir um Student vinculado ao user_id com status 'active'
     *  - O aluno deve ter ao menos uma matrícula ativa (status = 'active',
     *    start_date <= hoje, end_date >= hoje ou nulo)
     *  - Apenas simulados publicados (exam_status.slug = 'published')
     *  - Apenas simulados do(s) curso(s) da matrícula ativa
     *  - Retorna todos os simulados publicados do curso; use query params para filtrar.
     *
     *  Query params (todos opcionais):
     *  - period: open | closed | all — prazo do simulado (default: all)
     *  - subject_id: filtra por disciplina
     *  - attempt_status: status da tentativa do aluno
     *
     *  Campos extras: period_closed (prazo vencido), total_questions, total_points
     *
    * Cada item da resposta inclui o campo `attempt_status` com o status
    * da tentativa do aluno ('not_started' | 'in_progress' | 'pending_review' | 'awaiting_release' | 'completed').
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return $this->forbidden('Este endpoint é exclusivo para alunos.');
        }

        // Localizar o student vinculado ao usuário
        $student = Student::where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return $this->forbidden('Aluno não encontrado ou inativo.');
        }

        $courseIds = $this->enrollmentService->activeCourseIdsForStudent($student);

        if ($courseIds->isEmpty()) {
            return $this->success([], 'Nenhuma matrícula ativa encontrada.');
        }

        $period = $request->query('period', 'all');
        if (! in_array($period, ['open', 'closed', 'all'], true)) {
            $period = 'all';
        }

        // Retrocompat: include_expired=0 restringe ao período aberto
        if ($request->has('include_expired') && ! $request->boolean('include_expired')) {
            $period = 'open';
        }

        $examsQuery = Exam::with(['course', 'courses', 'subject', 'examStatus', 'examType'])
            ->withCount('questions')
            ->withSum('questions as total_points_sum', 'points')
            ->where('tenant_id', $user->tenant_id)
            ->forStudentCourses($courseIds)
            ->whereHas('examStatus', fn ($q) => $q->where('slug', 'published'));

        if ($period === 'open') {
            $examsQuery->where(function ($q) {
                $q->whereNull('ends_at')
                    ->orWhere('ends_at', '>=', now());
            });
        } elseif ($period === 'closed') {
            $examsQuery->whereNotNull('ends_at')
                ->where('ends_at', '<', now());
        }

        if ($request->filled('subject_id')) {
            $examsQuery->where('subject_id', (int) $request->query('subject_id'));
        }

        $exams = $examsQuery->orderBy('starts_at')->get();

        // Enriquecer com status e nota da tentativa mais recente do aluno por simulado
        $attemptStatuses = ExamAttempt::with(['attemptStatus:id,slug', 'exam:id,release_results_after_end,ends_at'])
            ->where('student_id', $student->id)
            ->whereIn('exam_id', $exams->pluck('id'))
            ->orderByDesc('started_at')
            ->get(['id', 'exam_id', 'attempt_status_id', 'score', 'max_score', 'percentage', 'started_at', 'expires_at'])
            ->unique('exam_id')
            ->keyBy('exam_id');

        $statusPriority = [
            'in_progress'      => 0,
            'not_started'      => 1,
            'abandoned'        => 1,
            'pending_review'   => 2,
            'awaiting_release' => 3,
            'completed'        => 4,
        ];

        $attemptStatusFilter = $request->query('attempt_status');

        $result = $exams->map(function (Exam $exam) use ($attemptStatuses, $statusPriority, $user) {
            $resource = (new ExamResource($exam))->resolve(request());
            $attempt  = $attemptStatuses->get($exam->id);

            if ($attempt?->status === 'in_progress') {
                $this->integrity->abandonIfTimedOut($attempt);
                $attempt->refresh();
            }

            $visibleStatus = $attempt?->visibleStatusFor($user->role) ?? 'not_started';
            $periodMeta    = $this->periodMeta($exam);

            $resource['total_questions'] = (int) ($exam->questions_count ?? 0);
            $resource['total_points']    = (float) ($exam->total_points_sum ?? 0);
            $resource                     = array_merge($resource, $periodMeta);
            $score = ($visibleStatus === 'awaiting_release')
                ? null
                : ($attempt?->score !== null ? (float) $attempt->score : null);
            $maxScore = $attempt?->max_score !== null ? (float) $attempt->max_score : null;
            $percentage = ($visibleStatus === 'awaiting_release')
                ? null
                : ($attempt?->percentage !== null ? (float) $attempt->percentage : null);

            $resource['attempt_status']   = $visibleStatus;
            $resource['nota']             = $score;
            $resource['score_display']    = $this->formatScoreFraction($score, $maxScore);
            $resource['aproveitamento']   = $percentage;
            $resource['_sort_can_start']  = $periodMeta['can_start'] ? 1 : 0;
            $resource['_sort_status_rank'] = $statusPriority[$resource['attempt_status']] ?? 99;

            return $resource;
        })
            ->when(
                $attemptStatusFilter,
                fn ($collection) => $collection->filter(
                    fn (array $item) => ($item['attempt_status'] ?? null) === $attemptStatusFilter
                )
            )
            ->sortBy([
                ['_sort_can_start', 'desc'],
                ['_sort_status_rank', 'asc'],
                ['starts_at', 'asc'],
            ])
            ->values()
            ->map(function (array $item) {
                unset($item['_sort_can_start'], $item['_sort_status_rank']);
                return $item;
            });

        return $this->success($result, 'Simulados disponíveis.');
    }

    /**
     * Exibe detalhes de um simulado específico para o aluno, incluindo as questões.
     * Aplica os mesmos critérios de elegibilidade do `index`.
     */
    public function show(Request $request, Exam $exam): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return $this->forbidden('Este endpoint é exclusivo para alunos.');
        }

        $student = Student::where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return $this->forbidden('Aluno não encontrado ou inativo.');
        }

        if (! $exam->isPublished()) {
            return $this->notFound('Simulado não disponível.');
        }

        if ($exam->tenant_id !== $user->tenant_id) {
            return $this->forbidden();
        }

        if (! $this->examAccess->hasActiveEnrollmentForExam($student, $exam)) {
            return $this->forbidden('Você não possui matrícula ativa neste curso.');
        }

        $exam->load(['course', 'courses', 'subject', 'examStatus', 'examType', 'questions.options', 'questions.subject']);

        $attempt = ExamAttempt::with(['attemptStatus', 'exam:id,release_results_after_end,ends_at'])
            ->where('exam_id', $exam->id)
            ->where('student_id', $student->id)
            ->latest('started_at')
            ->first();

        if ($attempt?->status === 'in_progress') {
            $this->integrity->abandonIfTimedOut($attempt);
            $attempt->refresh();
        }

        // Respostas do aluno nesta tentativa, indexadas por question_id
        $answers = $attempt
            ? $attempt->answers()->get(['question_id', 'option_id', 'text_answer'])->keyBy('question_id')
            : collect();

        $resource                   = (new ExamResource($exam))->resolve($request);
        $resource['attempt_status'] = $attempt?->visibleStatusFor($user->role) ?? 'not_started';
        $resource['attempt_id']     = $attempt?->id;
        $resource['expires_at']     = $attempt?->expires_at?->toISOString();
        $resource['time_remaining_seconds'] = ($attempt?->status === 'in_progress')
            ? $attempt->remainingSeconds()
            : null;
        $resource = array_merge($resource, $this->periodMeta($exam));

        // Injetar student_answer em cada questão
        if (! empty($resource['questions'])) {
            $resource['questions'] = collect($resource['questions'])->map(function ($q) use ($answers, $request) {
                if ($q instanceof \Illuminate\Http\Resources\Json\JsonResource) {
                    $q = $q->resolve($request);
                } elseif (! is_array($q)) {
                    $q = (array) $q;
                }

                $answer = $answers->get($q['id']);

                // Garante URL pública absoluta quando a imagem vier como path relativo.
                if (array_key_exists('image_url', $q)) {
                    $q['image_url'] = $this->normalizePublicMediaUrl($q['image_url']);
                }

                $q['student_answer'] = $answer
                    ? ['option_id' => $answer->option_id, 'text_answer' => $answer->text_answer]
                    : null;
                return $q;
            })->all();
        }

        return $this->success($resource);
    }

    private function normalizePublicMediaUrl(?string $url): ?string
    {
        if ($url === null || trim($url) === '') {
            return null;
        }

        $value = trim($url);

        if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://')) {
            return $value;
        }

        $normalized = ltrim($value, '/');

        if (str_starts_with($normalized, 'storage/')) {
            return asset($normalized);
        }

        return asset('storage/' . $normalized);
    }

    /**
     * Lista todas as tentativas do aluno autenticado.
    * Suporta filtro por ?status=in_progress|pending_review|awaiting_release|completed|abandoned
     */
    public function attempts(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return $this->forbidden('Este endpoint é exclusivo para alunos.');
        }

        $student = Student::where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return $this->forbidden('Aluno não encontrado ou inativo.');
        }

        $attempts = ExamAttempt::with(['exam.subject', 'exam.examType', 'exam.examStatus', 'answers'])
            ->where('student_id', $student->id)
            ->when($request->query('status'), fn ($q, $v) => $q->whereStatus($v))
            ->orderByDesc('started_at')
            ->paginate(20);

        return $this->success(ExamAttemptResource::collection($attempts)->resolve($request));
    }

    /**
     * Exibe uma tentativa do aluno com respostas e correção por questão.
     */
    public function reviewAttempt(Request $request, ExamAttempt $attempt): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return $this->forbidden('Este endpoint é exclusivo para alunos.');
        }

        $student = Student::where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return $this->forbidden('Aluno não encontrado ou inativo.');
        }

        if ($attempt->student_id !== $student->id) {
            return $this->forbidden('Você não possui acesso a esta tentativa.');
        }

        $attempt->load([
            'attemptStatus',
            'exam.course',
            'exam.subject',
            'exam.examType',
            'exam.examStatus',
            'answers',
        ]);

        if ($attempt->exam?->tenant_id !== $user->tenant_id) {
            return $this->forbidden();
        }

        if ($attempt->status === 'in_progress') {
            throw ValidationException::withMessages([
                'attempt_id' => ['A tentativa ainda está em andamento. Finalize para acompanhar a correção.'],
            ]);
        }

        $answersByQuestion = $attempt->answers->keyBy('question_id');
        $visibleStatus     = $attempt->visibleStatusFor($user->role);
        $resultsReleased   = $visibleStatus === 'completed';
        $awaitingRelease   = $visibleStatus === 'awaiting_release';

        $attempt->loadMissing(['exam.questions.options', 'exam.questions.subject']);

        $questions = $attempt->exam->questions
            ->sortBy('order')
            ->values()
            ->map(function ($question) use ($answersByQuestion, $resultsReleased, $awaitingRelease) {
                $answer        = $answersByQuestion->get($question->id);
                $correctOption = $question->options->firstWhere('is_correct', true);

                return [
                    'id'                => $question->id,
                    'type'              => $question->type,
                    'question_text'     => $question->question_text,
                    'points'            => (float) $question->points,
                    'order'             => $question->order,
                    'allow_text_answer' => (bool) $question->allow_text_answer,
                    'subject'           => $question->subject ? [
                        'id'   => $question->subject->id,
                        'name' => $question->subject->name,
                    ] : null,
                    'options'           => $question->options
                        ->sortBy('order')
                        ->values()
                        ->map(fn ($option) => [
                            'id'                  => $option->id,
                            'option_text'         => $option->option_text,
                            'order'               => $option->order,
                            'triggers_text_input' => (bool) $option->triggers_text_input,
                            'selected'            => $answer?->option_id === $option->id,
                            'is_correct'          => $resultsReleased ? (bool) $option->is_correct : null,
                        ]),
                    'student_answer'    => $answer ? [
                        'option_id'   => $answer->option_id,
                        'text_answer' => $answer->text_answer,
                    ] : null,
                    'correction'        => $awaitingRelease ? null : [
                        'is_correct'        => $answer?->is_correct,
                        'points_earned'     => $answer?->points_earned !== null ? (float) $answer->points_earned : null,
                        'max_points'        => (float) $question->points,
                        'correct_option_id' => $resultsReleased ? $correctOption?->id : null,
                    ],
                ];
            });

        $passingScore = $attempt->exam->passing_score;
        $score = $awaitingRelease ? null : ($attempt->score !== null ? (float) $attempt->score : null);
        $maxScore = $attempt->max_score !== null ? (float) $attempt->max_score : null;

        return $this->success([
            'id'                    => $attempt->id,
            'status'                => $visibleStatus,
            'started_at'            => $attempt->started_at?->toISOString(),
            'finished_at'           => $attempt->finished_at?->toISOString(),
            'score'                 => $score,
            'max_score'             => $maxScore,
            'score_display'         => $this->formatScoreFraction($score, $maxScore),
            'percentage'            => $awaitingRelease ? null : ($attempt->percentage !== null ? (float) $attempt->percentage : null),
            'pending_answers_count' => $visibleStatus === 'pending_review'
                ? $attempt->answers->whereNull('is_correct')->count()
                : null,
            'result_release_pending' => $awaitingRelease,
            'passed'                => $resultsReleased && $passingScore !== null
                ? (float) $attempt->percentage >= (float) $passingScore
                : null,
            'exam'                  => [
                'id'               => $attempt->exam->id,
                'title'            => $attempt->exam->title,
                'duration_minutes' => $attempt->exam->duration_minutes,
                'passing_score'    => $passingScore !== null ? (float) $passingScore : null,
                'exam_type'        => $attempt->exam->examType?->slug,
                'exam_type_label'  => $attempt->exam->examType?->label,
                'status'           => $attempt->exam->examStatus?->slug,
                'subject'          => $attempt->exam->subject ? [
                    'id'    => $attempt->exam->subject->id,
                    'name'  => $attempt->exam->subject->name,
                    'icon'  => $attempt->exam->subject->icon,
                    'color' => $attempt->exam->subject->color,
                ] : null,
            ],
            'questions'             => $questions,
        ], 'Tentativa carregada com sucesso.');
    }

    private function formatScoreFraction(?float $score, ?float $maxScore): ?string
    {
        if ($score === null || $maxScore === null) {
            return null;
        }

        return $this->formatScoreNumber($score) . '/' . $this->formatScoreNumber($maxScore);
    }

    private function formatScoreNumber(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
    }

    /**
     * @return array{
     *   period_status: 'upcoming'|'open'|'closed',
     *   period_closed: bool,
     *   period_not_started: bool,
     *   can_start: bool,
     *   period_message: string|null
     * }
     */
    private function periodMeta(Exam $exam): array
    {
        $periodStatus = $this->periodStatus($exam);

        return [
            'period_status'      => $periodStatus,
            'period_closed'      => $periodStatus === 'closed',
            'period_not_started' => $periodStatus === 'upcoming',
            'can_start'          => $periodStatus === 'open',
            'period_message'     => $this->periodMessage($exam, $periodStatus),
        ];
    }

    private function periodStatus(Exam $exam): string
    {
        $now = now();

        if ($exam->starts_at && $exam->starts_at->gt($now)) {
            return 'upcoming';
        }

        if ($exam->ends_at && $exam->ends_at->lt($now)) {
            return 'closed';
        }

        return 'open';
    }

    private function periodMessage(Exam $exam, string $periodStatus): ?string
    {
        return match ($periodStatus) {
            'upcoming' => $exam->starts_at
                ? 'Disponível a partir de ' . $exam->starts_at->timezone(config('app.timezone'))->format('d/m/Y, H:i') . '.'
                : 'Este simulado ainda não está liberado.',
            'closed' => $exam->ends_at
                ? 'Período encerrado em ' . $exam->ends_at->timezone(config('app.timezone'))->format('d/m/Y, H:i') . '.'
                : 'O prazo para realização foi encerrado.',
            default => null,
        };
    }
}
