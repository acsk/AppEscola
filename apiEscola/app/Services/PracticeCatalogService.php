<?php

namespace App\Services;

use App\Models\ExamQuestion;
use App\Models\QuestionDifficulty;
use App\Models\Student;
use App\Models\Subject;
use App\Support\QuestionRichText;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

/**
 * Catálogo do banco de questões para o aluno (protótipo do app): lista filtrada e, para cada filtro,
 * quantas questões cada opção traz com os OUTROS filtros aplicados (opção com 0 fica desabilitada no app).
 *
 * Filtros: search, subject_ids[], topic_ids[], situation (all|unanswered|wrong|saved|new), difficulty_id, years[], year_before.
 *
 * "Nova" = o aluno ainda não respondeu e a questão entrou no banco nos últimos NEW_DAYS dias
 * (questão do banco: criação; questão de simulado: quando o simulado encerrou).
 */
class PracticeCatalogService
{
    public const SITUATIONS = ['all', 'unanswered', 'wrong', 'saved', 'new'];
    public const NEW_DAYS = 14;
    /** Mínimo de respostas da turma para mostrar "% que acertam". */
    public const RATE_MIN_SAMPLE = 5;

    public function __construct(private readonly PracticeService $practice) {}

    public function list(Student $student, array $filters, int $page = 1, int $perPage = 20, string $sort = 'recent'): array
    {
        $query = $this->filtered($student, $filters);
        $total = (clone $query)->count();
        $rows = $query
            ->with(['subject:id,name', 'topics:id,name', 'difficulty:id,name', 'examType:id,label'])
            ->when($sort === 'oldest', fn (Builder $q) => $q->orderBy('exam_questions.id'), fn (Builder $q) => $q->orderByDesc('exam_questions.id'))
            ->forPage($page, $perPage)
            ->get(['exam_questions.*']);

        $ids = $rows->pluck('id');
        $rates = $this->rates((int) $student->tenant_id, $ids->all());
        $status = $this->statusFor($student, $ids->all());
        $saved = DB::table('practice_saved_questions')->where('student_id', $student->id)->whereIn('exam_question_id', $ids)->pluck('exam_question_id')->flip();

        return [
            'total' => $total,
            'page' => $page,
            'last_page' => max(1, (int) ceil($total / $perPage)),
            'items' => $rows->map(fn (ExamQuestion $q) => [
                'id'         => $q->id,
                'text'       => mb_substr(trim(preg_replace('/\s+/u', ' ', QuestionRichText::plain($q->question_text))), 0, 240),
                'has_image'  => (bool) $q->image_url,
                'subject'    => $q->subject ? ['id' => $q->subject->id, 'name' => $q->subject->name] : null,
                'topic'      => $q->topics->first()?->name,
                'difficulty' => $q->difficulty?->name,
                'source'     => $q->source_exam_name ?: trim(($q->examType?->label ?? '').' '.($q->year ?? '')) ?: null,
                'year'       => $q->year,
                'rate'       => $rates[$q->id] ?? null,
                'status'     => $status[$q->id] ?? 'new',
                'saved'      => isset($saved[$q->id]),
            ])->values(),
        ];
    }

    /** Contagem por opção de cada filtro, com os demais filtros aplicados. */
    public function facets(Student $student, array $filters): array
    {
        $without = fn (string ...$keys) => $this->filtered($student, array_diff_key($filters, array_flip($keys)));

        $subjects = $without('subject_ids', 'topic_ids')->whereNotNull('exam_questions.subject_id')
            ->select('exam_questions.subject_id', DB::raw('count(*) as total'))->groupBy('exam_questions.subject_id')->pluck('total', 'subject_id');
        $newBySubject = tap($without('subject_ids', 'topic_ids', 'situation'), fn (Builder $q) => $this->applySituation($q, $student, 'new'))
            ->whereNotNull('exam_questions.subject_id')
            ->select('exam_questions.subject_id', DB::raw('count(*) as total'))->groupBy('exam_questions.subject_id')->pluck('total', 'subject_id');
        $newByTopic = tap($without('topic_ids', 'situation'), fn (Builder $q) => $this->applySituation($q, $student, 'new'))
            ->join('exam_question_topic as n_eqt', 'n_eqt.exam_question_id', '=', 'exam_questions.id')
            ->select('n_eqt.subject_topic_id', DB::raw('count(distinct exam_questions.id) as total'))->groupBy('n_eqt.subject_topic_id')->pluck('total', 'subject_topic_id');
        $topics = $without('topic_ids')
            ->join('exam_question_topic as eqt', 'eqt.exam_question_id', '=', 'exam_questions.id')
            ->join('subject_topics as st', 'st.id', '=', 'eqt.subject_topic_id')
            ->select('st.id', 'st.name', 'st.subject_id', DB::raw('count(distinct exam_questions.id) as total'))
            ->groupBy('st.id', 'st.name', 'st.subject_id')->orderByDesc('total')->orderBy('st.name')->get();
        $difficulties = $without('difficulty_id')->whereNotNull('exam_questions.difficulty_id')
            ->select('exam_questions.difficulty_id', DB::raw('count(*) as total'))->groupBy('exam_questions.difficulty_id')->pluck('total', 'difficulty_id');
        $years = $without('years', 'year_before')->whereNotNull('exam_questions.year')
            ->select('exam_questions.year', DB::raw('count(*) as total'))->groupBy('exam_questions.year')->orderByDesc('exam_questions.year')->pluck('total', 'year');
        $situations = [];
        foreach (self::SITUATIONS as $situation) {
            $query = $without('situation');
            $this->applySituation($query, $student, $situation);
            $situations[$situation] = $query->count();
        }

        return [
            'total' => $this->filtered($student, $filters)->count(),
            'subjects' => Subject::query()->whereIn('id', $subjects->keys())->orderBy('name')->get(['id', 'name', 'color'])
                ->map(fn (Subject $s) => ['id' => $s->id, 'name' => $s->name, 'color' => $s->color ?? null, 'total' => (int) $subjects[$s->id], 'new' => (int) ($newBySubject[$s->id] ?? 0)])->values(),
            'topics' => $topics->map(fn ($t) => ['id' => (int) $t->id, 'name' => $t->name, 'subject_id' => (int) $t->subject_id, 'total' => (int) $t->total, 'new' => (int) ($newByTopic[$t->id] ?? 0)])->values(),
            'situations' => $situations,
            'difficulties' => QuestionDifficulty::query()->orderBy('sort_order')->get(['id', 'name'])
                ->map(fn ($d) => ['id' => $d->id, 'name' => $d->name, 'total' => (int) ($difficulties[$d->id] ?? 0)])->values(),
            'years' => $years->map(fn ($total, $year) => ['year' => (int) $year, 'total' => (int) $total])->values(),
        ];
    }

    /**
     * Ids sorteados para uma sessão, por prioridade: novas, não respondidas, as que errou e, por fim, as demais.
     * Dentro de cada grupo a ordem é aleatória.
     */
    public function drawIds(Student $student, array $filters, ?int $limit): array
    {
        $situation = $filters['situation'] ?? 'all';
        $tiers = match ($situation) {
            'all' => ['new', 'unanswered', 'wrong', 'all'],
            'unanswered' => ['new', 'unanswered'],
            default => [$situation],
        };
        $ids = [];
        foreach ($tiers as $tier) {
            $query = $this->filtered($student, ['situation' => $tier] + $filters)->select('exam_questions.id');
            $remaining = $limit === null ? null : $limit - count($ids);
            if ($remaining !== null && $remaining <= 0) {
                break;
            }
            $ids = array_merge($ids, $query->whereNotIn('exam_questions.id', $ids ?: [0])->inRandomOrder()
                ->when($remaining, fn (Builder $q) => $q->limit($remaining))->pluck('exam_questions.id')->all());
        }

        return $ids;
    }

    public function filtered(Student $student, array $filters): Builder
    {
        $query = $this->practice->practicableFor($student);
        $subjectIds = array_values(array_filter(array_map('intval', (array) ($filters['subject_ids'] ?? []))));
        $topicIds = array_values(array_filter(array_map('intval', (array) ($filters['topic_ids'] ?? []))));
        $years = array_values(array_filter(array_map('intval', (array) ($filters['years'] ?? []))));
        $yearBefore = isset($filters['year_before']) ? (int) $filters['year_before'] : null;

        $query->when($subjectIds, fn (Builder $q) => $q->whereIn('exam_questions.subject_id', $subjectIds))
            ->when($topicIds, fn (Builder $q) => $q->whereExists(fn (QueryBuilder $e) => $e->select(DB::raw(1))->from('exam_question_topic as f_eqt')
                ->whereColumn('f_eqt.exam_question_id', 'exam_questions.id')->whereIn('f_eqt.subject_topic_id', $topicIds)))
            ->when($filters['difficulty_id'] ?? null, fn (Builder $q, $id) => $q->where('exam_questions.difficulty_id', (int) $id))
            ->when($years || $yearBefore, fn (Builder $q) => $q->where(fn (Builder $y) => $y
                ->when($years, fn (Builder $w) => $w->orWhereIn('exam_questions.year', $years))
                ->when($yearBefore, fn (Builder $w) => $w->orWhere('exam_questions.year', '<', $yearBefore))));
        $this->applySituation($query, $student, $filters['situation'] ?? 'all');

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            if (preg_match('/^#?(\d+)$/', $search, $m)) {
                $query->where('exam_questions.id', (int) $m[1]);
            } else {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $query->where(fn (Builder $q) => $q->where('exam_questions.question_text', 'like', $like)
                    ->orWhere('exam_questions.source_exam_name', 'like', $like)
                    ->orWhereExists(fn (QueryBuilder $e) => $e->select(DB::raw(1))->from('exam_question_topic as s_eqt')
                        ->join('subject_topics as s_st', 's_st.id', '=', 's_eqt.subject_topic_id')
                        ->whereColumn('s_eqt.exam_question_id', 'exam_questions.id')->where('s_st.name', 'like', $like)));
            }
        }

        return $query;
    }

    private function applySituation(Builder $query, Student $student, string $situation): void
    {
        $answers = fn (QueryBuilder $e) => $e->select(DB::raw(1))->from('practice_answers as s_pa')
            ->whereColumn('s_pa.exam_question_id', 'exam_questions.id')->where('s_pa.student_id', $student->id)
            ->where(fn ($c) => $c->whereNull('s_pa.practice_attempt_id')->orWhereExists(fn ($a) => $a->select(DB::raw(1))->from('practice_attempts as s_pat')
                ->whereColumn('s_pat.id', 's_pa.practice_attempt_id')->where(fn ($w) => $w->whereNotNull('s_pat.finished_at')->orWhere('s_pat.correction_mode', 'each'))));
        match ($situation) {
            'unanswered' => $query->whereNotExists($answers),
            // Errei: a última resposta (já corrigida) foi errada.
            'wrong' => $query->whereExists(fn (QueryBuilder $e) => $answers($e)->where('s_pa.is_correct', false)
                ->whereRaw('s_pa.id = (select max(l_pa.id) from practice_answers as l_pa where l_pa.exam_question_id = exam_questions.id and l_pa.student_id = ?)', [$student->id])),
            'saved' => $query->whereExists(fn (QueryBuilder $e) => $e->select(DB::raw(1))->from('practice_saved_questions as sv')
                ->whereColumn('sv.exam_question_id', 'exam_questions.id')->where('sv.student_id', $student->id)),
            'new' => $query->whereNotExists($answers)->where(function (Builder $q) {
                $since = now()->subDays(self::NEW_DAYS);
                $q->where(fn (Builder $b) => $b->whereNull('exam_questions.exam_id')->where('exam_questions.created_at', '>=', $since))
                    ->orWhereExists(fn (QueryBuilder $e) => $e->select(DB::raw(1))->from('exams as n_ex')
                        ->whereColumn('n_ex.id', 'exam_questions.exam_id')->whereRaw('coalesce(n_ex.ends_at, n_ex.updated_at) >= ?', [$since]));
            }),
            default => null,
        };
    }

    /** % da turma (escola) que acerta, com amostra mínima. */
    private function rates(int $tenantId, array $ids): array
    {
        if (! $ids) {
            return [];
        }

        return DB::table('practice_answers')->where('tenant_id', $tenantId)->whereIn('exam_question_id', $ids)
            ->select('exam_question_id', DB::raw('count(*) as n'), DB::raw('sum(case when is_correct then 1 else 0 end) as ok'))
            ->groupBy('exam_question_id')->get()
            ->filter(fn ($r) => $r->n >= self::RATE_MIN_SAMPLE)
            ->mapWithKeys(fn ($r) => [$r->exam_question_id => (int) round($r->ok / $r->n * 100)])->all();
    }

    /** right/wrong pela última resposta já corrigida do aluno; sem resposta = new. */
    private function statusFor(Student $student, array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $latest = DB::table('practice_answers as pa')
            ->where('pa.student_id', $student->id)->whereIn('pa.exam_question_id', $ids)
            ->where(fn ($c) => $c->whereNull('pa.practice_attempt_id')->orWhereExists(fn ($a) => $a->select(DB::raw(1))->from('practice_attempts as pat')
                ->whereColumn('pat.id', 'pa.practice_attempt_id')->where(fn ($w) => $w->whereNotNull('pat.finished_at')->orWhere('pat.correction_mode', 'each'))))
            ->orderBy('pa.id')->get(['pa.exam_question_id', 'pa.is_correct']);

        return $latest->mapWithKeys(fn ($r) => [$r->exam_question_id => $r->is_correct ? 'right' : 'wrong'])->all();
    }
}
