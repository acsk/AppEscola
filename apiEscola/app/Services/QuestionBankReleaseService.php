<?php

namespace App\Services;

use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\QuestionBankTopicRelease;
use App\Models\Subject;
use App\Models\SubjectTopic;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Liberação de assuntos do banco para um curso.
 * A marcação manual e a de cada simulado oficial convivem: o assunto segue aberto enquanto houver ao menos uma origem.
 */
class QuestionBankReleaseService
{
    /** Turmas deste ano em diante só praticam assuntos liberados. Antes disso, a disciplina da grade inteira. */
    public const TOPIC_MODE_FROM_YEAR = 2027;

    /** Assuntos das questões do simulado e quais deste simulado já estão liberados. */
    public function examPayload(Exam $exam): array
    {
        $released = QuestionBankTopicRelease::query()
            ->where('exam_id', $exam->id)
            ->pluck('subject_topic_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->flip();

        $subjects = [];
        $questions = $exam->questions()->with(['topics.subject:id,name'])->get(['id']);
        foreach ($questions as $question) {
            foreach ($question->topics as $topic) {
                $subjectId = (int) $topic->subject_id;
                $subjects[$subjectId] ??= [
                    'id' => $subjectId,
                    'name' => $topic->subject?->name ?? '',
                    'topics' => [],
                ];
                $subjects[$subjectId]['topics'][$topic->id] ??= [
                    'id' => (int) $topic->id,
                    'name' => $topic->name,
                    'questions_count' => 0,
                    'selected' => isset($released[$topic->id]),
                ];
                $subjects[$subjectId]['topics'][$topic->id]['questions_count']++;
            }
        }

        $subjects = array_values(array_map(function (array $subject) {
            $subject['topics'] = array_values($subject['topics']);
            usort($subject['topics'], fn ($a, $b) => strcasecmp($a['name'], $b['name']));

            return $subject;
        }, $subjects));
        usort($subjects, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        $courses = $exam->courses()->orderBy('courses.name')->get(['courses.id', 'courses.name']);
        if ($courses->isEmpty() && $exam->course_id) {
            $courses = Course::query()->whereKey($exam->course_id)->get(['id', 'name']);
        }

        return [
            'configured' => $released->isNotEmpty(),
            'courses' => $courses->map(fn (Course $course) => ['id' => (int) $course->id, 'name' => $course->name])->values(),
            'subjects' => $subjects,
        ];
    }

    /**
     * @param  list<int>  $topicIds
     */
    public function syncExam(Exam $exam, bool $enabled, array $topicIds): void
    {
        if (! $enabled) {
            QuestionBankTopicRelease::query()->where('exam_id', $exam->id)->delete();

            return;
        }

        $topicIds = array_values(array_unique(array_map('intval', $topicIds)));
        $allowed = $this->topicIdsOnExam($exam);
        if (array_diff($topicIds, $allowed) !== []) {
            throw ValidationException::withMessages([
                'topic_ids' => ['Só é possível liberar assuntos que estão nas questões deste simulado.'],
            ]);
        }
        if ($topicIds === []) {
            throw ValidationException::withMessages([
                'topic_ids' => ['Marque ao menos um assunto para liberar.'],
            ]);
        }

        $exam->unsetRelation('courses');
        $courseIds = $exam->linkedCourseIds()->map(fn ($id) => (int) $id)->all();
        if ($courseIds === []) {
            throw ValidationException::withMessages([
                'course_ids' => ['Vincule ao menos um curso ao simulado para liberar os assuntos no banco.'],
            ]);
        }

        $this->replaceExamRows($exam, $courseIds, $topicIds);
    }

    /** Mantém os assuntos já liberados por este simulado nos cursos atuais. Sem curso, a liberação deste simulado sai. */
    public function realignExamCourses(Exam $exam): void
    {
        $topicIds = QuestionBankTopicRelease::query()
            ->where('exam_id', $exam->id)
            ->distinct()
            ->pluck('subject_topic_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        if ($topicIds === []) {
            return;
        }

        $topicIds = array_values(array_intersect($topicIds, $this->topicIdsOnExam($exam)));
        $exam->unsetRelation('courses');
        $courseIds = $exam->linkedCourseIds()->map(fn ($id) => (int) $id)->all();
        if ($courseIds === [] || $topicIds === []) {
            QuestionBankTopicRelease::query()->where('exam_id', $exam->id)->delete();

            return;
        }

        $this->replaceExamRows($exam, $courseIds, $topicIds);
    }

    /** Assuntos da disciplina e, em cada curso, se a liberação é manual, de simulado, ou das duas. */
    public function subjectPayload(Subject $subject): array
    {
        $topics = SubjectTopic::query()
            ->where('subject_id', $subject->id)
            ->orderBy('name')
            ->get(['id', 'name']);
        $courses = Course::query()
            ->where('tenant_id', $subject->tenant_id)
            ->where('status', 'active')
            ->orderBy('name')
            ->get(['id', 'name']);

        $rows = QuestionBankTopicRelease::query()
            ->whereIn('subject_topic_id', $topics->pluck('id'))
            ->with('exam:id,title')
            ->get();
        $byTopic = $rows->groupBy('subject_topic_id');

        return [
            'subject' => ['id' => (int) $subject->id, 'name' => $subject->name],
            'courses' => $courses->map(fn (Course $course) => ['id' => (int) $course->id, 'name' => $course->name])->values(),
            'topics' => $topics->map(function (SubjectTopic $topic) use ($byTopic) {
                $releases = [];
                foreach (($byTopic->get($topic->id) ?? collect())->groupBy('course_id') as $courseId => $group) {
                    $releases[] = [
                        'course_id' => (int) $courseId,
                        'manual' => $group->contains(fn (QuestionBankTopicRelease $row) => $row->origin === QuestionBankTopicRelease::ORIGIN_MANUAL),
                        'exams' => $group
                            ->filter(fn (QuestionBankTopicRelease $row) => $row->exam_id !== null)
                            ->unique('exam_id')
                            ->map(fn (QuestionBankTopicRelease $row) => ['id' => (int) $row->exam_id, 'title' => $row->exam?->title ?? 'Simulado'])
                            ->values(),
                    ];
                }

                return [
                    'id' => (int) $topic->id,
                    'name' => $topic->name,
                    'releases' => $releases,
                ];
            })->values(),
        ];
    }

    /**
     * @param  list<int>  $topicIds
     */
    public function syncManual(Subject $subject, int $courseId, array $topicIds): void
    {
        $course = Course::query()->where('tenant_id', $subject->tenant_id)->whereKey($courseId)->first();
        if (! $course) {
            throw ValidationException::withMessages([
                'course_id' => ['Curso inválido para esta escola.'],
            ]);
        }

        $topicIds = array_values(array_unique(array_map('intval', $topicIds)));
        $allowed = SubjectTopic::query()->where('subject_id', $subject->id)->pluck('id')->map(fn ($id) => (int) $id)->all();
        if (array_diff($topicIds, $allowed) !== []) {
            throw ValidationException::withMessages([
                'topic_ids' => ['Há assuntos que não pertencem a esta disciplina.'],
            ]);
        }

        DB::transaction(function () use ($subject, $courseId, $topicIds, $allowed) {
            QuestionBankTopicRelease::query()
                ->where('course_id', $courseId)
                ->where('origin', QuestionBankTopicRelease::ORIGIN_MANUAL)
                ->whereIn('subject_topic_id', $allowed ?: [0])
                ->delete();

            if ($topicIds === []) {
                return;
            }

            $now = now();
            QuestionBankTopicRelease::query()->insert(array_map(fn (int $topicId) => [
                'tenant_id' => $subject->tenant_id,
                'course_id' => $courseId,
                'subject_topic_id' => $topicId,
                'exam_id' => null,
                'origin' => QuestionBankTopicRelease::ORIGIN_MANUAL,
                'origin_key' => QuestionBankTopicRelease::ORIGIN_MANUAL,
                'created_at' => $now,
                'updated_at' => $now,
            ], $topicIds));
        });
    }

    /**
     * @param  list<int>  $courseIds
     * @param  list<int>  $topicIds
     */
    private function replaceExamRows(Exam $exam, array $courseIds, array $topicIds): void
    {
        DB::transaction(function () use ($exam, $courseIds, $topicIds) {
            QuestionBankTopicRelease::query()->where('exam_id', $exam->id)->delete();
            $now = now();
            $rows = [];
            foreach ($courseIds as $courseId) {
                foreach ($topicIds as $topicId) {
                    $rows[] = [
                        'tenant_id' => $exam->tenant_id,
                        'course_id' => $courseId,
                        'subject_topic_id' => $topicId,
                        'exam_id' => $exam->id,
                        'origin' => QuestionBankTopicRelease::ORIGIN_EXAM,
                        'origin_key' => QuestionBankTopicRelease::ORIGIN_EXAM.':'.$exam->id,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
            }
            foreach (array_chunk($rows, 500) as $chunk) {
                QuestionBankTopicRelease::query()->insert($chunk);
            }
        });
    }

    /** @return list<int> */
    private function topicIdsOnExam(Exam $exam): array
    {
        return ExamQuestion::query()
            ->where('exam_id', $exam->id)
            ->join('exam_question_topic as eqt', 'eqt.exam_question_id', '=', 'exam_questions.id')
            ->distinct()
            ->pluck('eqt.subject_topic_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
