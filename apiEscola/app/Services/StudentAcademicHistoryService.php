<?php

namespace App\Services;

use App\Models\Enrollment;
use App\Models\ExamAttempt;
use App\Models\Student;
use Illuminate\Support\Collection;

class StudentAcademicHistoryService
{
    public function __construct(
        private readonly StudentPerformanceService $performance,
    ) {
    }

    /**
     * Histórico acadêmico completo: dados do aluno, matrículas (cursos/turmas)
     * e simulados online com resultados detalhados.
     *
     * @return array<string, mixed>
     */
    public function build(Student $student): array
    {
        $student->loadMissing([
            'desiredCourses:id,name',
            'guardians:id,name,document,email,phone',
        ]);

        $enrollments = $this->loadEnrollments($student);
        $attempts = $this->loadAttempts((int) $student->id);

        $completed = $attempts->filter(fn (array $row) => ($row['status'] ?? null) === 'completed');
        $withPercentage = $completed->filter(fn (array $row) => $row['percentage'] !== null);

        return [
            'student' => $this->studentPayload($student),
            'summary' => [
                'enrollments_count' => $enrollments->count(),
                'active_enrollments_count' => $enrollments
                    ->filter(fn (array $row) => ($row['status'] ?? null) === 'active')
                    ->count(),
                'attempts_count' => $attempts->count(),
                'completed_attempts_count' => $completed->count(),
                'average_percentage' => $withPercentage->isEmpty()
                    ? null
                    : round((float) $withPercentage->avg('percentage'), 2),
                'passed_count' => $completed->filter(fn (array $row) => $row['passed'] === true)->count(),
                'failed_count' => $completed->filter(fn (array $row) => $row['passed'] === false)->count(),
            ],
            'enrollments' => $enrollments->values()->all(),
            'exam_attempts' => $attempts->values()->all(),
        ];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function loadEnrollments(Student $student): Collection
    {
        $rows = Enrollment::query()
            ->where('student_id', $student->id)
            ->with([
                'schoolClass:id,name,course_id',
                'schoolClass.course:id,name',
                'schoolClasses:id,name,course_id',
                'schoolClasses.course:id,name',
                'coursePlan:id,name,course_id',
                'coursePlan.course:id,name',
                'bundle:id,name,billing_cycle',
            ])
            ->orderByDesc('start_date')
            ->orderByDesc('id')
            ->get();

        return $rows->map(fn (Enrollment $enrollment) => $this->mapEnrollment($enrollment));
    }

    /**
     * @return array<string, mixed>
     */
    private function mapEnrollment(Enrollment $enrollment): array
    {
        $base = $this->performance->mapEnrollmentForHistory($enrollment);

        return array_merge($base, [
            'start_date' => $enrollment->start_date?->toDateString(),
            'end_date' => $enrollment->end_date?->toDateString(),
            'monthly_amount' => $enrollment->monthly_amount !== null
                ? (float) $enrollment->monthly_amount
                : null,
            'discount_amount' => $enrollment->discount_amount !== null
                ? (float) $enrollment->discount_amount
                : null,
        ]);
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function loadAttempts(int $studentId): Collection
    {
        $attempts = ExamAttempt::query()
            ->with([
                'attemptStatus',
                'exam.subject:id,name,icon,color',
                'exam.examType',
                'exam.examStatus',
                'exam.questions.options',
                'answers',
            ])
            ->where('student_id', $studentId)
            ->orderByDesc('started_at')
            ->orderByDesc('id')
            ->limit(200)
            ->get();

        return $attempts->map(fn (ExamAttempt $attempt) => $this->mapAttempt($attempt));
    }

    /**
     * @return array<string, mixed>
     */
    private function mapAttempt(ExamAttempt $attempt): array
    {
        $status = $attempt->attemptStatus?->slug;
        $score = $attempt->score !== null ? (float) $attempt->score : null;
        $maxScore = $attempt->max_score !== null ? (float) $attempt->max_score : null;
        $percentage = $attempt->percentage !== null ? (float) $attempt->percentage : null;

        $passingScore = $attempt->exam?->passing_score !== null
            ? (float) $attempt->exam->passing_score
            : null;

        $passed = null;
        if ($status === 'completed' && $percentage !== null && $passingScore !== null) {
            $passed = $percentage >= $passingScore;
        }

        $questions = $attempt->exam?->relationLoaded('questions')
            ? $attempt->exam->questions->keyBy('id')
            : collect();
        $options = $questions->flatMap->options->keyBy('id');

        $answers = $attempt->answers->map(function ($answer) use ($questions, $options) {
            $question = $questions->get($answer->question_id);

            return [
                'id' => (int) $answer->id,
                'question_id' => (int) $answer->question_id,
                'question_text' => $question?->question_text,
                'question_order' => $question?->order,
                'type' => $question?->type,
                'points' => $question?->points !== null ? (float) $question->points : null,
                'option_id' => $answer->option_id !== null ? (int) $answer->option_id : null,
                'option_text' => $answer->option_id
                    ? ($options->get($answer->option_id)?->option_text)
                    : null,
                'text_answer' => $answer->text_answer,
                'is_correct' => $answer->is_correct,
                'points_earned' => $answer->points_earned !== null
                    ? (float) $answer->points_earned
                    : null,
            ];
        })->values()->all();

        $correctCount = collect($answers)->where('is_correct', true)->count();
        $totalQuestions = count($answers);

        return [
            'id' => (int) $attempt->id,
            'exam_id' => (int) $attempt->exam_id,
            'exam' => $attempt->exam ? [
                'id' => (int) $attempt->exam->id,
                'title' => (string) $attempt->exam->title,
                'duration_minutes' => $attempt->exam->duration_minutes,
                'passing_score' => $passingScore,
                'exam_type' => $attempt->exam->examType?->slug,
                'exam_type_label' => $attempt->exam->examType?->label,
                'status' => $attempt->exam->examStatus?->slug,
                'subject' => $attempt->exam->subject ? [
                    'id' => (int) $attempt->exam->subject->id,
                    'name' => (string) $attempt->exam->subject->name,
                    'icon' => $attempt->exam->subject->icon,
                    'color' => $attempt->exam->subject->color,
                ] : null,
            ] : null,
            'started_at' => $attempt->started_at?->toISOString(),
            'finished_at' => $attempt->finished_at?->toISOString(),
            'status' => $status,
            'score' => $score,
            'max_score' => $maxScore,
            'score_display' => $this->formatScoreFraction($score, $maxScore),
            'percentage' => $percentage,
            'passed' => $passed,
            'correct_answers' => $totalQuestions > 0 ? $correctCount : null,
            'total_questions' => $totalQuestions > 0 ? $totalQuestions : null,
            'answers' => $answers,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function studentPayload(Student $student): array
    {
        $desiredCourses = $student->relationLoaded('desiredCourses')
            ? $student->desiredCourses
            : collect();

        $guardians = $student->relationLoaded('guardians')
            ? $student->guardians
            : collect();

        return [
            'id' => (int) $student->id,
            'tenant_id' => $student->tenant_id,
            'enrollment_number' => $student->enrollment_number,
            'name' => $student->name,
            'birth_date' => $student->birth_date?->toDateString(),
            'document' => $student->document,
            'email' => $student->email,
            'phone' => $student->phone,
            'photo_url' => $student->photo_url,
            'is_minor' => (bool) $student->is_minor,
            'status' => $student->status,
            'desired_courses' => $desiredCourses
                ->map(fn ($course) => ['id' => (int) $course->id, 'name' => (string) $course->name])
                ->values()
                ->all(),
            'guardians' => $guardians
                ->map(fn ($guardian) => [
                    'id' => (int) $guardian->id,
                    'name' => (string) $guardian->name,
                    'document' => $guardian->document,
                    'email' => $guardian->email,
                    'phone' => $guardian->phone,
                ])
                ->values()
                ->all(),
        ];
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
}
