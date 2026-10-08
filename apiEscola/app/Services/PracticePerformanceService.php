<?php

namespace App\Services;

use App\Models\PracticeAnswer;
use App\Models\Student;
use App\Models\Subject;
use App\Models\SubjectTopic;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Desempenho de prática do aluno (disciplina → assunto, com o que estudar) e ranking de quem mais
 * responde no banco de questões. Só usa respostas "contadas" (avulsas e de simulados finalizados).
 */
class PracticePerformanceService
{
    /** Abaixo disso o nível é "poucos dados": a taxa de acerto ainda não diz muito. */
    public const MIN_SAMPLE = 5;

    public const LEVEL_NOT_STARTED = 'not_started';
    public const LEVEL_FEW_DATA = 'few_data';
    public const LEVEL_WEAK = 'weak';
    public const LEVEL_ATTENTION = 'attention';
    public const LEVEL_GOOD = 'good';

    /** week = semana corrente (segunda 00:00 até agora); last_week = semana anterior fechada (consolidada). */
    public const PERIODS = ['week', 'last_week', 'month', 'all'];

    /** A semana do ranking vira na segunda 00:00 do horário escolar, não em UTC. */
    private const RANKING_TIMEZONE = 'America/Sao_Paulo';

    private const FOCUS_LIMIT = 5;

    public function __construct(private readonly PracticeService $practice) {}

    public function performance(Student $student): array
    {
        $answers = fn () => PracticeAnswer::query()->counted()
            ->where('practice_answers.student_id', $student->id)
            ->join('exam_questions as eq', 'eq.id', '=', 'practice_answers.exam_question_id');

        $bySubject = $answers()
            ->select('eq.subject_id', ...$this->scoreColumns())
            ->groupBy('eq.subject_id')->get()
            ->keyBy(fn ($row) => (int) $row->subject_id);
        $byTopic = $answers()
            ->leftJoin('exam_question_topic as eqt', 'eqt.exam_question_id', '=', 'eq.id')
            ->select('eq.subject_id', 'eqt.subject_topic_id as topic_id', ...$this->scoreColumns())
            ->groupBy('eq.subject_id', 'eqt.subject_topic_id')->get()
            ->groupBy(fn ($row) => (int) $row->subject_id);
        $available = collect($this->practice->filters($student)['subjects'])->keyBy('id');

        $subjectIds = $bySubject->keys()->merge($available->keys())->unique();
        $subjectNames = Subject::query()->whereIn('id', $subjectIds->filter())->pluck('name', 'id');
        $topicNames = SubjectTopic::query()
            ->whereIn('id', $byTopic->flatten(1)->pluck('topic_id')->filter()->unique())
            ->pluck('name', 'id');

        $subjects = $subjectIds->map(function (int $subjectId) use ($bySubject, $byTopic, $available, $subjectNames, $topicNames) {
            $offer = $available->get($subjectId);
            $topicOffer = collect($offer['topics'] ?? [])->keyBy('id');
            $answeredTopics = ($byTopic->get($subjectId) ?? collect())->keyBy(fn ($row) => (int) $row->topic_id);

            $topics = $answeredTopics->keys()->merge($topicOffer->keys())->unique()
                ->map(fn (int $topicId) => [
                    'id'        => $topicId ?: null,
                    'name'      => $topicId ? ($topicNames[$topicId] ?? $topicOffer->get($topicId)['name'] ?? 'Assunto') : 'Sem assunto',
                    'available' => (int) ($topicOffer->get($topicId)['total'] ?? 0),
                ] + $this->score($answeredTopics->get($topicId)))
                ->sort(fn (array $a, array $b) => $this->compareByPriority($a, $b))
                ->values();

            return [
                'id'        => $subjectId ?: null,
                'name'      => $subjectId ? ($subjectNames[$subjectId] ?? 'Disciplina') : 'Sem disciplina',
                'available' => (int) ($offer['total'] ?? 0),
                'topics'    => $topics,
            ] + $this->score($bySubject->get($subjectId));
        })
            ->filter(fn (array $s) => $s['answered'] > 0 || $s['available'] > 0)
            ->sort(fn (array $a, array $b) => $this->compareByPriority($a, $b))
            ->values();

        $overall = $answers()->select(...$this->scoreColumns())->first();

        return [
            'min_sample'  => self::MIN_SAMPLE,
            'overall'     => $this->score($overall),
            'study_focus' => $this->studyFocus($subjects),
            'subjects'    => $subjects,
        ];
    }

    /**
     * Ranking de quem mais respondeu no período: conta questões diferentes (repetir a mesma questão
     * não sobe posição); empate pelos acertos. Posições empatadas são iguais (1, 2, 2, 4).
     */
    public function ranking(int $tenantId, string $period, int $limit, ?int $viewerStudentId = null, bool $fullNames = false): array
    {
        [$since, $until] = $this->periodRange($period);
        $rows = PracticeAnswer::query()->counted()
            ->where('practice_answers.tenant_id', $tenantId)
            ->when($since, fn (Builder $q) => $q->where('practice_answers.answered_at', '>=', $since))
            ->when($until, fn (Builder $q) => $q->where('practice_answers.answered_at', '<', $until))
            ->join('students as s', 's.id', '=', 'practice_answers.student_id')
            ->where('s.status', 'active')
            ->whereNull('s.deleted_at')
            ->select(
                's.id', 's.name', 's.photo_url', 's.enrollment_number',
                DB::raw('count(distinct practice_answers.exam_question_id) as questions'),
                ...$this->scoreColumns(),
            )
            ->groupBy('s.id', 's.name', 's.photo_url', 's.enrollment_number')
            ->orderByDesc('questions')->orderByDesc('correct')->orderBy('s.id')
            ->get();

        $position = 0;
        $previous = null;
        $ranked = $rows->values()->map(function ($row, int $index) use (&$position, &$previous, $viewerStudentId, $fullNames) {
            $key = $row->questions.'|'.$row->correct;
            if ($key !== $previous) {
                $position = $index + 1;
                $previous = $key;
            }

            return [
                'position'  => $position,
                'name'      => $fullNames ? $row->name : $this->shortName($row->name),
                'photo_url' => $row->photo_url,
                'questions' => (int) $row->questions,
                'is_me'     => $viewerStudentId !== null && (int) $row->id === $viewerStudentId,
            ] + $this->score($row) + ($fullNames ? [
                'student_id'        => (int) $row->id,
                'enrollment_number' => $row->enrollment_number,
            ] : []);
        });

        return [
            'period'       => $period,
            'since'        => $since?->toIso8601String(),
            'until'        => $until?->toIso8601String(),
            'participants' => $ranked->count(),
            'ranking'      => $ranked->take($limit)->values(),
            'me'           => $viewerStudentId !== null ? $ranked->firstWhere('is_me', true) : null,
        ];
    }

    /** @return array{0: ?Carbon, 1: ?Carbon} início (inclusivo) e fim (exclusivo), em UTC; null = sem limite. */
    private function periodRange(string $period): array
    {
        $weekStart = now(self::RANKING_TIMEZONE)->startOfWeek(Carbon::MONDAY)->utc();

        return match ($period) {
            'week'      => [$weekStart, null],
            'last_week' => [$weekStart->copy()->subWeek(), $weekStart],
            'month'     => [now()->subDays(30), null],
            default     => [null, null],
        };
    }

    /** Até 5 assuntos para estudar: primeiro os de acerto baixo, depois os ainda não praticados. */
    private function studyFocus(Collection $subjects): Collection
    {
        $topics = $subjects->flatMap(fn (array $subject) => collect($subject['topics'])
            ->filter(fn (array $topic) => $topic['id'] !== null)
            ->map(fn (array $topic) => $topic + ['subject' => ['id' => $subject['id'], 'name' => $subject['name']]]));

        $weak = $topics->filter(fn (array $t) => in_array($t['level'], [self::LEVEL_WEAK, self::LEVEL_ATTENTION], true))
            ->sortBy([['accuracy', 'asc'], ['answered', 'desc']])
            ->map(fn (array $t) => $t + ['reason' => 'low_accuracy']);
        $notStarted = $topics->filter(fn (array $t) => $t['level'] === self::LEVEL_NOT_STARTED && $t['available'] > 0)
            ->sortByDesc('available')
            ->map(fn (array $t) => $t + ['reason' => 'not_started']);

        return $weak->concat($notStarted)->take(self::FOCUS_LIMIT)
            ->map(fn (array $t) => [
                'subject'   => $t['subject'],
                'topic'     => ['id' => $t['id'], 'name' => $t['name']],
                'reason'    => $t['reason'],
                'level'     => $t['level'],
                'answered'  => $t['answered'],
                'correct'   => $t['correct'],
                'accuracy'  => $t['accuracy'],
                'available' => $t['available'],
            ])->values();
    }

    /** Mais urgente primeiro: fraco < atenção < poucos dados < bom < não iniciado; depois menor acerto. */
    private function compareByPriority(array $a, array $b): int
    {
        $order = [self::LEVEL_WEAK => 0, self::LEVEL_ATTENTION => 1, self::LEVEL_FEW_DATA => 2, self::LEVEL_GOOD => 3, self::LEVEL_NOT_STARTED => 4];

        return [$order[$a['level']], $a['accuracy'] ?? 0, -$a['answered'], -$a['available']]
            <=> [$order[$b['level']], $b['accuracy'] ?? 0, -$b['answered'], -$b['available']];
    }

    private function scoreColumns(): array
    {
        return [
            DB::raw('count(*) as answered'),
            DB::raw('sum(case when practice_answers.is_correct then 1 else 0 end) as correct'),
        ];
    }

    private function score(?object $row): array
    {
        $answered = (int) ($row->answered ?? 0);
        $correct = (int) ($row->correct ?? 0);
        $accuracy = $answered > 0 ? round($correct / $answered * 100, 1) : null;

        return [
            'answered' => $answered,
            'correct'  => $correct,
            'accuracy' => $accuracy,
            'level'    => $this->level($answered, $accuracy),
        ];
    }

    private function level(int $answered, ?float $accuracy): string
    {
        return match (true) {
            $answered === 0              => self::LEVEL_NOT_STARTED,
            $answered < self::MIN_SAMPLE => self::LEVEL_FEW_DATA,
            $accuracy < 50               => self::LEVEL_WEAK,
            $accuracy < 70               => self::LEVEL_ATTENTION,
            default                      => self::LEVEL_GOOD,
        };
    }

    /** "MARIA DA SILVA" → "MARIA S." para o ranking visto por outros alunos. */
    private function shortName(?string $name): string
    {
        $parts = preg_split('/\s+/', trim((string) $name)) ?: [];
        $first = $parts[0] ?? 'Aluno';
        $last = count($parts) > 1 ? end($parts) : null;

        return $last ? $first.' '.mb_substr($last, 0, 1).'.' : $first;
    }
}
