<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PracticeAttempt;
use App\Models\Student;
use App\Services\ExamAccessService;
use App\Models\PracticeSavedQuestion;
use App\Services\PracticeCatalogService;
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
        private readonly PracticeCatalogService $catalog,
    ) {}

    /** Filtros do catálogo (busca, disciplina, assunto, situação, dificuldade, ano). */
    private function catalogFilters(Request $request): array
    {
        return $request->validate([
            'search'        => ['nullable', 'string', 'max:120'],
            'subject_ids'   => ['nullable', 'array', 'max:30'],
            'subject_ids.*' => ['integer'],
            'topic_ids'     => ['nullable', 'array', 'max:50'],
            'topic_ids.*'   => ['integer'],
            'situation'     => ['nullable', Rule::in(PracticeCatalogService::SITUATIONS)],
            'difficulty_id' => ['nullable', 'integer'],
            'years'         => ['nullable', 'array', 'max:20'],
            'years.*'       => ['integer', 'min:1900', 'max:2100'],
            'year_before'   => ['nullable', 'integer', 'min:1900', 'max:2100'],
        ]);
    }

    /** GET aluno/practice/questions — lista filtrada (com `facets=1`, também as contagens por filtro). */
    public function questions(Request $request): JsonResponse
    {
        $student = $this->student($request);
        $filters = $this->catalogFilters($request);
        $extra = $request->validate([
            'page'   => ['nullable', 'integer', 'min:1'],
            'sort'   => ['nullable', Rule::in(['recent', 'oldest'])],
            'facets' => ['nullable', 'boolean'],
        ]);
        $list = $this->catalog->list($student, $filters, (int) ($extra['page'] ?? 1), 20, $extra['sort'] ?? 'recent');
        if ($request->boolean('facets')) {
            $list['facets'] = $this->catalog->facets($student, $filters);
        }

        return $this->success($list);
    }

    /** GET aluno/practice/facets — quantas questões cada opção de filtro traz com os demais aplicados. */
    public function facets(Request $request): JsonResponse
    {
        return $this->success($this->catalog->facets($this->student($request), $this->catalogFilters($request)));
    }

    /** POST/DELETE aluno/practice/questions/{question}/save — salvar questão para rever depois. */
    public function saveQuestion(Request $request, int $question): JsonResponse
    {
        $student = $this->student($request);
        if (! $this->practice->practicableFor($student)->whereKey($question)->exists()) {
            return $this->error('Questão indisponível.', null, 404);
        }
        PracticeSavedQuestion::firstOrCreate(['student_id' => $student->id, 'exam_question_id' => $question], ['tenant_id' => $student->tenant_id]);

        return $this->success(['saved' => true], 'Questão salva.');
    }

    public function unsaveQuestion(Request $request, int $question): JsonResponse
    {
        PracticeSavedQuestion::query()->where('student_id', $this->student($request)->id)->where('exam_question_id', $question)->delete();

        return $this->success(['saved' => false], 'Questão removida dos salvos.');
    }

    /** POST aluno/practice/sessions — monta a sessão (quantidade, correção, cronômetro) a partir dos filtros. */
    public function startSession(Request $request): JsonResponse
    {
        $student = $this->student($request);
        $filters = $this->catalogFilters($request);
        $data = $request->validate([
            'quantity'        => ['nullable', 'integer', Rule::in([10, 20, 30])],
            'correction_mode' => ['required', Rule::in(['each', 'end'])],
            'timed'           => ['sometimes', 'boolean'],
            'title'           => ['nullable', 'string', 'max:120'],
        ], [], ['quantity' => 'quantidade', 'correction_mode' => 'correção']);
        $attempt = $this->practice->startSession(
            $student, array_filter($filters, fn ($v) => $v !== null && $v !== []), $data['quantity'] ?? null, $data['correction_mode'],
            $request->boolean('timed') ? 90 : null, $data['title'] ?? 'Sessão de prática', $this->catalog
        );

        return $this->created($this->practice->attemptPayload($attempt), "Sessão com {$attempt->question_count} questão(ões) pronta.");
    }

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
        // Sessão com correção a cada questão: devolve a correção junto.
        $feedback = $this->practice->feedbackInAttempt($model, (int) $data['question_id']);

        return $this->success($this->practice->attemptSummary($model) + ($feedback ? ['feedback' => $feedback] : []), 'Resposta salva.');
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
