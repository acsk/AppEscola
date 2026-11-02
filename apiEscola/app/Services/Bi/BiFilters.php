<?php

namespace App\Services\Bi;

use App\Services\PracticePerformanceService;
use Illuminate\Support\Carbon;

/**
 * Filtros globais já validados. Datas no fuso da escola; utcRange() para consultar colunas timestamp.
 * O período anterior tem a mesma duração e termina no dia antes de `from`.
 */
class BiFilters
{
    public const MODALITY_ONLINE = 'online';

    public const MODALITY_PRESENCIAL = 'presencial';

    public const MODALITIES = [self::MODALITY_ONLINE, self::MODALITY_PRESENCIAL];

    public function __construct(
        public readonly Carbon $from,
        public readonly Carbon $to,
        public readonly ?int $schoolYear = null,
        public readonly ?int $courseId = null,
        public readonly ?int $schoolClassId = null,
        public readonly ?int $subjectId = null,
        public readonly ?int $teacherId = null,
        public readonly ?int $examTypeId = null,
        public readonly ?string $modality = null,
    ) {
    }

    /** @param  array<string, mixed>  $validated */
    public static function fromValidated(array $validated): self
    {
        $tz = PracticePerformanceService::RANKING_TIMEZONE;

        if (! empty($validated['from']) && ! empty($validated['to'])) {
            $from = Carbon::createFromFormat('Y-m-d', $validated['from'], $tz)->startOfDay();
            $to = Carbon::createFromFormat('Y-m-d', $validated['to'], $tz)->startOfDay();
        } else {
            $to = Carbon::now($tz)->startOfDay();
            $from = $to->copy()->subDays((int) config('bi.default_period_days', 90) - 1);
        }

        $int = fn (string $key) => isset($validated[$key]) ? (int) $validated[$key] : null;

        return new self(
            from: $from,
            to: $to,
            schoolYear: $int('school_year'),
            courseId: $int('course_id'),
            schoolClassId: $int('school_class_id'),
            subjectId: $int('subject_id'),
            teacherId: $int('teacher_id'),
            examTypeId: $int('exam_type_id'),
            modality: $validated['modality'] ?? null,
        );
    }

    public function days(): int
    {
        return (int) $this->from->diffInDays($this->to) + 1;
    }

    public function previous(): self
    {
        $to = $this->from->copy()->subDay();

        return new self(
            from: $to->copy()->subDays($this->days() - 1),
            to: $to,
            schoolYear: $this->schoolYear,
            courseId: $this->courseId,
            schoolClassId: $this->schoolClassId,
            subjectId: $this->subjectId,
            teacherId: $this->teacherId,
            examTypeId: $this->examTypeId,
            modality: $this->modality,
        );
    }

    public function withSubject(int $subjectId): self
    {
        return new self(
            from: $this->from,
            to: $this->to,
            schoolYear: $this->schoolYear,
            courseId: $this->courseId,
            schoolClassId: $this->schoolClassId,
            subjectId: $subjectId,
            teacherId: $this->teacherId,
            examTypeId: $this->examTypeId,
            modality: $this->modality,
        );
    }

    /** Início inclusivo e fim exclusivo, em UTC, para colunas timestamp. @return array{0: Carbon, 1: Carbon} */
    public function utcRange(): array
    {
        return [$this->from->copy()->utc(), $this->to->copy()->addDay()->utc()];
    }

    /** Para colunas date (assessment_date, attendance_date). @return array{0: string, 1: string} */
    public function dateRange(): array
    {
        return [$this->from->toDateString(), $this->to->toDateString()];
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'from' => $this->from->toDateString(),
            'to' => $this->to->toDateString(),
            'school_year' => $this->schoolYear,
            'course_id' => $this->courseId,
            'school_class_id' => $this->schoolClassId,
            'subject_id' => $this->subjectId,
            'teacher_id' => $this->teacherId,
            'exam_type_id' => $this->examTypeId,
            'modality' => $this->modality,
        ];
    }
}
