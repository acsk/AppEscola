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

    /** Lista tentativas (admin vê todas; aluno vê apenas as suas) */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);
        $user     = $request->user();

        $query = ExamAttempt::with(['exam', 'student'])
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->when($request->query('exam_id'),    fn ($q, $v) => $q->where('exam_id', $v))
            ->when($request->query('student_id'), fn ($q, $v) => $q->where('student_id', $v))
            ->when($request->query('status'),     fn ($q, $v) => $q->where('status', $v));

        return response()->json(ExamAttemptResource::collection($query->orderByDesc('started_at')->paginate(20)));
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
            ->where('status', 'in_progress')
            ->exists();

        if ($inProgress) {
            throw ValidationException::withMessages([
                'exam_id' => ['Já existe uma tentativa em andamento para este simulado.'],
            ]);
        }

        $attempt = ExamAttempt::create([
            'tenant_id'  => $tenantId,
            'exam_id'    => $exam->id,
            'student_id' => $student->id,
            'max_score'  => $exam->totalPoints(),
            'status'     => 'in_progress',
        ]);

        // Retorna as questões SEM gabarito (options sem is_correct)
        $attempt->load(['exam.questions.options', 'student']);

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

            foreach ($attempt->answers as $answer) {
                $question = $answer->question;

                if ($question->type === 'multiple_choice' && $answer->option_id) {
                    $isCorrect = $question->options()
                        ->where('id', $answer->option_id)
                        ->where('is_correct', true)
                        ->exists();

                    $earned = $isCorrect ? (float) $question->points : 0;
                    $answer->update(['is_correct' => $isCorrect, 'points_earned' => $earned]);
                    $totalScore += $earned;
                }
                // Discursivas ficam com is_correct = null (aguardando correção manual)
            }

            $maxScore   = (float) $attempt->max_score ?: 1;
            $percentage = round(($totalScore / $maxScore) * 100, 2);

            $attempt->update([
                'status'      => 'completed',
                'finished_at' => now(),
                'score'       => $totalScore,
                'percentage'  => $percentage,
            ]);
        });

        $attempt->load(['exam', 'student', 'answers']);

        return response()->json(new ExamAttemptResource($attempt));
    }

    /** Exibe resultado detalhado de uma tentativa */
    public function show(Request $request, ExamAttempt $attempt): JsonResponse
    {
        $attempt->load(['exam.questions.options', 'student', 'answers']);

        return response()->json(new ExamAttemptResource($attempt));
    }

    /** Ranking dos alunos no simulado (para gráficos) */
    public function ranking(Request $request, Exam $exam): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $attempts = ExamAttempt::with('student:id,name,enrollment_number')
            ->where('exam_id', $exam->id)
            ->where('status', 'completed')
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
}
