<?php

namespace App\Services;

use App\Exceptions\QuestionBankException;
use App\Models\ExamQuestion;
use App\Models\PracticeAnswer;
use App\Models\PracticeAttempt;
use App\Models\QuestionSet;
use App\Models\Student;
use App\Models\Subject;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Prática do aluno no banco de questões: questões avulsas (correção na hora) e simulados do banco
 * (correção ao finalizar). Não gera nota oficial nem ranking. O gabarito só sai depois da resposta.
 */
class PracticeService
{
    private const QUESTION_RELATIONS = ['options', 'subject:id,name', 'topics:id,name', 'difficulty:id,name', 'examType:id,label'];

    public function __construct(
        private readonly QuestionSetService $sets,
        private readonly StudentEnrollmentService $enrollments,
    ) {}

    /** Disciplinas (e assuntos) com questões para praticar, com a quantidade de cada. */
    public function filters(Student $student): array
    {
        $base = fn () => $this->practicableFor($student);

        $subjects = $base()->whereNotNull('exam_questions.subject_id')
            ->select('exam_questions.subject_id', DB::raw('count(*) as total'))
            ->groupBy('exam_questions.subject_id')->pluck('total', 'subject_id');
        $topics = $base()
            ->join('exam_question_topic as eqt', 'eqt.exam_question_id', '=', 'exam_questions.id')
            ->join('subject_topics as st', 'st.id', '=', 'eqt.subject_topic_id')
            ->select('st.id', 'st.name', 'st.subject_id', DB::raw('count(*) as total'))
            ->groupBy('st.id', 'st.name', 'st.subject_id')->orderBy('st.name')->get()
            ->groupBy('subject_id');

        return [
            'total'    => $base()->count(),
            'subjects' => Subject::query()->whereIn('id', $subjects->keys())->orderBy('name')->get(['id', 'name'])
                ->map(fn (Subject $s) => [
                    'id'     => $s->id,
                    'name'   => $s->name,
                    'total'  => (int) $subjects[$s->id],
                    'topics' => ($topics->get($s->id) ?? collect())->map(fn ($t) => [
                        'id' => (int) $t->id, 'name' => $t->name, 'total' => (int) $t->total,
                    ])->values(),
                ])->values(),
        ];
    }

    /** Próxima questão avulsa pelos filtros, priorizando as que o aluno ainda não respondeu. */
    public function nextQuestion(Student $student, array $filters): ?ExamQuestion
    {
        $query = $this->practicableFor($student)
            ->when($filters['subject_id'] ?? null, fn (Builder $q, $id) => $q->where('exam_questions.subject_id', $id))
            ->when($filters['difficulty_id'] ?? null, fn (Builder $q, $id) => $q->where('exam_questions.difficulty_id', $id))
            ->when($filters['topic_id'] ?? null, fn (Builder $q, $id) => $q->whereHas('topics', fn (Builder $t) => $t->where('subject_topics.id', $id)))
            ->when($filters['exclude_id'] ?? null, fn (Builder $q, $id) => $q->where('exam_questions.id', '!=', $id));
        $answered = fn (Builder $q) => $q->whereExists(fn ($e) => $e->select(DB::raw(1))->from('practice_answers as pa')
            ->whereColumn('pa.exam_question_id', 'exam_questions.id')->where('pa.student_id', $student->id));

        $unseen = (clone $query)->whereNot($answered)->inRandomOrder()->with(self::QUESTION_RELATIONS)->first();

        return $unseen ?? $query->inRandomOrder()->with(self::QUESTION_RELATIONS)->first();
    }

    /**
     * Questões avulsas que o aluno pode praticar (banco + simulados oficiais encerrados), só das disciplinas
     * da grade das suas turmas. Sem grade cadastrada nas turmas, vale o banco inteiro da escola (o app não fica vazio).
     */
    private function practicableFor(Student $student): Builder
    {
        $subjectIds = $this->enrollments->activeSubjectIdsForStudent($student);

        return ExamQuestion::query()->practiceAvailable((int) $student->tenant_id)
            ->when($subjectIds->isNotEmpty(), fn (Builder $q) => $q->whereIn('exam_questions.subject_id', $subjectIds));
    }

    /** Responde uma questão avulsa: correção imediata. */
    public function answerQuestion(Student $student, int $questionId, int $optionId): array
    {
        $question = $this->practicableFor($student)->with('options')->find($questionId);
        if (! $question) {
            throw new QuestionBankException('Questão indisponível para prática.', 404);
        }
        $isCorrect = $this->isCorrect($question, $optionId);
        PracticeAnswer::create([
            'tenant_id'        => $student->tenant_id,
            'student_id'       => $student->id,
            'exam_question_id' => $question->id,
            'option_id'        => $optionId,
            'is_correct'       => $isCorrect,
            'answered_at'      => now(),
        ]);

        return $this->feedback($question, $optionId, $isCorrect);
    }

    /** Simulados do banco publicados, com a última tentativa do aluno. */
    public function publishedSets(Student $student): Collection
    {
        $sets = QuestionSet::query()
            ->where('tenant_id', $student->tenant_id)
            ->where('status', QuestionSet::STATUS_PUBLISHED)
            ->with('examType:id,slug,label,logo_url')
            ->latest('id')
            ->get();
        $attempts = PracticeAttempt::query()->where('student_id', $student->id)
            ->whereIn('question_set_id', $sets->pluck('id'))
            ->orderByDesc('id')->get()->groupBy('question_set_id');

        return $sets
            ->map(function (QuestionSet $set) use ($attempts) {
                $setAttempts = $attempts->get($set->id) ?? collect();
                $last = $setAttempts->first();
                $best = $setAttempts->filter->isFinished()->sortByDesc('correct_count')->first();

                return [
                    'id'                => $set->id,
                    'title'             => $set->title,
                    'description'       => $set->description,
                    'origin'            => $set->origin,
                    'exam_type'         => $set->examType ? ['label' => $set->examType->label, 'logo_url' => $set->examType->logo_url] : null,
                    'questions_count'   => $this->sets->practicableQuery($set)->count(),
                    'attempts_count'    => $setAttempts->count(),
                    'open_attempt_id'   => $last && ! $last->isFinished() ? $last->id : null,
                    'last_result'       => $best ? ['correct' => $best->correct_count, 'total' => $best->question_count, 'finished_at' => $best->finished_at?->toIso8601String()] : null,
                ];
            })
            ->filter(fn ($set) => $set['questions_count'] > 0)
            ->values();
    }

    /** Inicia (ou retoma a tentativa aberta) um simulado do banco publicado. */
    public function startSet(Student $student, int $setId): PracticeAttempt
    {
        $set = QuestionSet::query()->where('tenant_id', $student->tenant_id)
            ->where('status', QuestionSet::STATUS_PUBLISHED)->find($setId);
        if (! $set) {
            throw new QuestionBankException('Simulado indisponível.', 404);
        }
        $open = PracticeAttempt::query()->where('student_id', $student->id)
            ->where('question_set_id', $set->id)->whereNull('finished_at')->latest('id')->first();
        if ($open) {
            return $open;
        }
        $count = $this->sets->practicableQuery($set)->count();
        if ($count === 0) {
            throw new QuestionBankException('Este simulado ainda não tem questões disponíveis.');
        }

        return PracticeAttempt::create([
            'tenant_id'       => $student->tenant_id,
            'student_id'      => $student->id,
            'question_set_id' => $set->id,
            'question_count'  => $count,
            'started_at'      => now(),
        ]);
    }

    /** Questões da tentativa (sem gabarito enquanto aberta) e as respostas já marcadas. */
    public function attemptPayload(PracticeAttempt $attempt): array
    {
        $set = $attempt->questionSet;
        $questions = $set ? $this->sets->practicableQuery($set)->with(self::QUESTION_RELATIONS)->get() : collect();
        $answers = $attempt->answers()->get()->keyBy('exam_question_id');
        $finished = $attempt->isFinished();

        return [
            'attempt' => $this->attemptSummary($attempt),
            'question_set' => $set ? ['id' => $set->id, 'title' => $set->title, 'description' => $set->description] : null,
            'questions' => $questions->map(function (ExamQuestion $question) use ($answers, $finished) {
                $answer = $answers->get($question->id);

                return $this->questionPayload($question) + [
                    'selected_option_id' => $answer?->option_id,
                ] + ($finished ? $this->feedback($question, $answer?->option_id, (bool) $answer?->is_correct) : []);
            })->values(),
        ];
    }

    /** Marca (ou troca) a resposta de uma questão do simulado; a correção só aparece ao finalizar. */
    public function answerInAttempt(PracticeAttempt $attempt, int $questionId, int $optionId): void
    {
        if ($attempt->isFinished()) {
            throw QuestionBankException::conflict('Este simulado já foi finalizado.');
        }
        $question = $attempt->questionSet
            ? $this->sets->practicableQuery($attempt->questionSet)->with('options')->find($questionId)
            : null;
        if (! $question) {
            throw new QuestionBankException('Esta questão não faz parte do simulado.', 404);
        }
        PracticeAnswer::updateOrCreate(
            ['practice_attempt_id' => $attempt->id, 'exam_question_id' => $question->id],
            [
                'tenant_id'   => $attempt->tenant_id,
                'student_id'  => $attempt->student_id,
                'option_id'   => $optionId,
                'is_correct'  => $this->isCorrect($question, $optionId),
                'answered_at' => now(),
            ],
        );
    }

    public function finishAttempt(PracticeAttempt $attempt): PracticeAttempt
    {
        if ($attempt->isFinished()) {
            return $attempt;
        }
        $questionIds = $attempt->questionSet
            ? $this->sets->practicableQuery($attempt->questionSet)->pluck('exam_questions.id')
            : collect();
        $answers = $attempt->answers()->whereIn('exam_question_id', $questionIds)->get();
        $attempt->update([
            'question_count' => $questionIds->count(),
            'answered_count' => $answers->count(),
            'correct_count'  => $answers->where('is_correct', true)->count(),
            'finished_at'    => now(),
        ]);

        return $attempt;
    }

    /** Resumo para o Desempenho (o detalhe por disciplina/assunto fica em PracticePerformanceService). */
    public function summary(Student $student): array
    {
        $answers = PracticeAnswer::query()->counted()->where('practice_answers.student_id', $student->id);
        $answered = (clone $answers)->count();
        $correct = (clone $answers)->where('practice_answers.is_correct', true)->count();

        return [
            'answered'    => $answered,
            'correct'     => $correct,
            'accuracy'    => $answered > 0 ? round($correct / $answered * 100, 1) : null,
            'recent_sets' => PracticeAttempt::query()->where('student_id', $student->id)->whereNotNull('finished_at')
                ->with('questionSet:id,title')->latest('finished_at')->limit(10)->get()
                ->map(fn (PracticeAttempt $a) => [
                    'attempt_id'  => $a->id,
                    'title'       => $a->questionSet?->title ?? 'Simulado excluído',
                    'correct'     => $a->correct_count,
                    'total'       => $a->question_count,
                    'finished_at' => $a->finished_at?->toIso8601String(),
                ])->values(),
        ];
    }

    /** Questão para o aluno: sem indicar a alternativa correta. */
    public function questionPayload(ExamQuestion $question): array
    {
        return [
            'id'               => $question->id,
            'question_text'    => $question->question_text,
            'image_url'        => $question->image_url,
            'source_exam_name' => $question->source_exam_name,
            'subject'          => $question->subject ? ['id' => $question->subject->id, 'name' => $question->subject->name] : null,
            'topics'           => $question->topics->pluck('name')->values(),
            'difficulty'       => $question->difficulty?->name,
            'exam_type'        => $question->examType?->label,
            'options'          => $question->options
                ->filter(fn ($o) => trim((string) $o->option_text) !== '')
                ->map(fn ($o) => ['id' => $o->id, 'option_text' => $o->option_text])->values(),
        ];
    }

    public function attemptSummary(PracticeAttempt $attempt): array
    {
        return [
            'id'              => $attempt->id,
            'question_set_id' => $attempt->question_set_id,
            'question_count'  => $attempt->question_count,
            'answered_count'  => $attempt->isFinished() ? $attempt->answered_count : $attempt->answers()->count(),
            'correct_count'   => $attempt->isFinished() ? $attempt->correct_count : null,
            'started_at'      => $attempt->started_at?->toIso8601String(),
            'finished_at'     => $attempt->finished_at?->toIso8601String(),
        ];
    }

    private function isCorrect(ExamQuestion $question, int $optionId): bool
    {
        $option = $question->options->firstWhere('id', $optionId);
        if (! $option || trim((string) $option->option_text) === '') {
            throw new QuestionBankException('Alternativa inválida para esta questão.');
        }

        return (bool) $option->is_correct;
    }

    /** Correção: só depois da resposta (ou do fim do simulado). */
    private function feedback(ExamQuestion $question, ?int $optionId, bool $isCorrect): array
    {
        return [
            'is_correct'        => $optionId !== null ? $isCorrect : null,
            'correct_option_id' => $question->options->firstWhere('is_correct', true)?->id,
            'explanation'       => $question->explanation,
        ];
    }
}
