<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ExamAttemptResource;
use App\Http\Resources\ExamResource;
use App\Models\Exam;
use App\Models\ExamAttempt;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StudentExamController extends Controller
{
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
     *  - Simulados cujo prazo ainda não encerrou (ends_at >= agora ou nulo)
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

        // Matrículas ativas dentro do período vigente
        $today = now()->toDateString();

        $courseIds = DB::table('enrollments')
            ->join('course_plans', 'enrollments.course_plan_id', '=', 'course_plans.id')
            ->where('enrollments.student_id', $student->id)
            ->where('enrollments.status', 'active')
            ->where('enrollments.start_date', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('enrollments.end_date')
                  ->orWhere('enrollments.end_date', '>=', $today);
            })
            ->whereNull('enrollments.deleted_at')
            ->pluck('course_plans.course_id')
            ->unique()
            ->values();

        if ($courseIds->isEmpty()) {
            return $this->success([], 'Nenhuma matrícula ativa encontrada.');
        }

        $exams = Exam::with(['course', 'subject', 'examStatus', 'examType'])
            ->where('tenant_id', $user->tenant_id)
            ->whereIn('course_id', $courseIds)
            ->whereHas('examStatus', fn ($q) => $q->where('slug', 'published'))
            ->orderBy('starts_at')
            ->get();

        // Enriquecer com status da tentativa do aluno
        $attemptStatuses = ExamAttempt::with('attemptStatus:id,slug')
            ->where('student_id', $student->id)
            ->whereIn('exam_id', $exams->pluck('id'))
            ->get(['exam_id', 'attempt_status_id'])
            ->keyBy('exam_id');

        $result = $exams->map(function (Exam $exam) use ($attemptStatuses) {
            $resource = (new ExamResource($exam))->resolve(request());
            $attempt  = $attemptStatuses->get($exam->id);

            $resource['attempt_status'] = $attempt?->status ?? 'not_started';
            $resource['can_start']      = $this->canStart($exam);

            return $resource;
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

        // Verificar se o aluno tem matrícula ativa no curso do simulado
        $today = now()->toDateString();

        $hasEnrollment = DB::table('enrollments')
            ->join('course_plans', 'enrollments.course_plan_id', '=', 'course_plans.id')
            ->where('enrollments.student_id', $student->id)
            ->where('course_plans.course_id', $exam->course_id)
            ->where('enrollments.status', 'active')
            ->where('enrollments.start_date', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('enrollments.end_date')
                  ->orWhere('enrollments.end_date', '>=', $today);
            })
            ->whereNull('enrollments.deleted_at')
            ->exists();

        if (! $hasEnrollment) {
            return $this->forbidden('Você não possui matrícula ativa neste curso.');
        }

        $exam->load(['course', 'subject', 'examStatus', 'examType', 'questions.options', 'questions.subject']);

        $attempt = ExamAttempt::with(['attemptStatus', 'exam:id,release_results_after_end,ends_at'])
            ->where('exam_id', $exam->id)
            ->where('student_id', $student->id)
            ->latest('started_at')
            ->first();

        // Respostas do aluno nesta tentativa, indexadas por question_id
        $answers = $attempt
            ? $attempt->answers()->get(['question_id', 'option_id', 'text_answer'])->keyBy('question_id')
            : collect();

        $resource                   = (new ExamResource($exam))->resolve($request);
        $resource['attempt_status'] = $attempt?->visibleStatusFor($user->role) ?? 'not_started';
        $resource['attempt_id']     = $attempt?->id;
        $resource['can_start']      = $this->canStart($exam);

        // Injetar student_answer em cada questão
        if (! empty($resource['questions'])) {
            $resource['questions'] = collect($resource['questions'])->map(function ($q) use ($answers) {
                $answer = $answers->get($q['id']);
                $q['student_answer'] = $answer
                    ? ['option_id' => $answer->option_id, 'text_answer' => $answer->text_answer]
                    : null;
                return $q;
            })->all();
        }

        return $this->success($resource);
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

        return $this->success([
            'id'                    => $attempt->id,
            'status'                => $visibleStatus,
            'started_at'            => $attempt->started_at?->toISOString(),
            'finished_at'           => $attempt->finished_at?->toISOString(),
            'score'                 => $awaitingRelease ? null : ($attempt->score !== null ? (float) $attempt->score : null),
            'max_score'             => $attempt->max_score !== null ? (float) $attempt->max_score : null,
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

    /**
     * Verifica se o simulado ainda pode ser iniciado
     * (starts_at <= agora <= ends_at, ou sem datas definidas).
     */
    private function canStart(Exam $exam): bool
    {
        $now = now();

        if ($exam->starts_at && $exam->starts_at->gt($now)) {
            return false;
        }

        if ($exam->ends_at && $exam->ends_at->lt($now)) {
            return false;
        }

        return true;
    }
}
