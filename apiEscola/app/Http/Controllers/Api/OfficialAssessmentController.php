<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOfficialAssessmentRequest;
use App\Http\Requests\UpdateOfficialAssessmentRequest;
use App\Http\Requests\UpsertOfficialAssessmentGradesRequest;
use App\Http\Resources\OfficialAssessmentGradeResource;
use App\Http\Resources\OfficialAssessmentResource;
use App\Models\Enrollment;
use App\Models\OfficialAssessment;
use App\Models\OfficialAssessmentGrade;
use App\Models\Student;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class OfficialAssessmentController extends Controller
{
    use ScopedByTenant;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->denyUnlessStaff($request);

        $query = OfficialAssessment::query()
            ->with([
                'course:id,name',
                'schoolClass:id,name',
                'subject:id,name,icon,color',
                'subjects:id,name,icon,color',
                'examType:id,slug,label',
            ])
            ->withCount('grades');

        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('school_class_id'), fn ($q, $v) => $q->where('school_class_id', $v))
            ->when($request->query('course_id'), fn ($q, $v) => $q->where('course_id', $v))
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('kind'), fn ($q, $v) => $q->where('kind', $v))
            ->when($request->query('assessment_date_from'), fn ($q, $v) => $q->whereDate('assessment_date', '>=', $v))
            ->when($request->query('assessment_date_to'), fn ($q, $v) => $q->whereDate('assessment_date', '<=', $v))
            ->when($request->query('search'), fn ($q, $v) => $q->where('title', 'like', "%{$v}%"))
            ->when($request->query('subject_id'), function ($q, $v) {
                $q->where(function ($inner) use ($v) {
                    $inner->where('subject_id', $v)
                        ->orWhereHas('subjects', fn ($sq) => $sq->where('subjects.id', $v));
                });
            });

        return OfficialAssessmentResource::collection(
            $query->orderByDesc('assessment_date')->orderByDesc('id')->paginate(20)
        );
    }

    public function store(StoreOfficialAssessmentRequest $request): JsonResponse
    {
        $this->denyUnlessStaff($request);
        $tenantId = $this->requireTenantId($request);

        $data = $request->validated();
        $subjectIds = $this->normalizeSubjectIds($data);
        unset($data['subject_ids'], $data['subject_id']);
        $this->assertRelatedEntitiesBelongToTenant($tenantId, $data);
        $this->assertSubjectIdsBelongToTenant($tenantId, $subjectIds);

        $assessment = OfficialAssessment::create([
            ...$data,
            'tenant_id' => $tenantId,
            'subject_id' => $subjectIds[0] ?? null,
            'max_score' => $data['max_score'] ?? 10,
            'weight' => $data['weight'] ?? 1,
            'counts_towards_report_card' => (bool) ($data['counts_towards_report_card'] ?? true),
            'status' => $data['status'] ?? OfficialAssessment::STATUS_DRAFT,
        ]);
        $this->syncSubjects($assessment, $subjectIds);

        $assessment->load([
            'course:id,name',
            'schoolClass:id,name',
            'subject:id,name,icon,color',
            'subjects:id,name,icon,color',
            'examType:id,slug,label',
        ]);

        return $this->created(new OfficialAssessmentResource($assessment), 'Avaliação oficial cadastrada com sucesso.');
    }

    public function show(Request $request, OfficialAssessment $officialAssessment): JsonResponse
    {
        $this->denyUnlessStaff($request);
        $this->assertAssessmentTenant($request, $officialAssessment);

        $officialAssessment->load([
            'course:id,name',
            'schoolClass:id,name',
            'subject:id,name,icon,color',
            'subjects:id,name,icon,color',
            'examType:id,slug,label',
            'grades.student:id,name,enrollment_number',
            'grades.subject:id,name,icon,color',
        ]);

        return $this->success(new OfficialAssessmentResource($officialAssessment));
    }

    public function update(UpdateOfficialAssessmentRequest $request, OfficialAssessment $officialAssessment): JsonResponse
    {
        $this->denyUnlessStaff($request);
        $tenantId = $this->requireTenantId($request);
        $this->assertAssessmentTenant($request, $officialAssessment);

        if ($officialAssessment->status === OfficialAssessment::STATUS_PUBLISHED) {
            return $this->error('Avaliação já publicada. Edite apenas as notas.', null, 422);
        }

        $data = $request->validated();
        $subjectIds = array_key_exists('subject_ids', $data)
            ? $this->normalizeSubjectIds($data)
            : null;
        unset($data['subject_ids'], $data['subject_id']);
        $this->assertRelatedEntitiesBelongToTenant($tenantId, $data);
        if ($subjectIds !== null) {
            $this->assertSubjectIdsBelongToTenant($tenantId, $subjectIds);
            $data['subject_id'] = $subjectIds[0] ?? null;
        }
        $officialAssessment->update($data);
        if ($subjectIds !== null) {
            $this->syncSubjects($officialAssessment, $subjectIds);
        }
        $officialAssessment->load([
            'course:id,name',
            'schoolClass:id,name',
            'subject:id,name,icon,color',
            'subjects:id,name,icon,color',
            'examType:id,slug,label',
        ]);

        return $this->success(new OfficialAssessmentResource($officialAssessment), 'Avaliação oficial atualizada com sucesso.');
    }

    public function destroy(Request $request, OfficialAssessment $officialAssessment): JsonResponse
    {
        $this->denyUnlessStaff($request);
        $this->assertAssessmentTenant($request, $officialAssessment);

        if ($officialAssessment->status === OfficialAssessment::STATUS_PUBLISHED) {
            return $this->error('Não é possível remover avaliação publicada.', null, 422);
        }

        $officialAssessment->delete();

        return $this->deleted('Avaliação oficial removida com sucesso.');
    }

    public function upsertGrades(
        UpsertOfficialAssessmentGradesRequest $request,
        OfficialAssessment $officialAssessment
    ): JsonResponse {
        $this->denyUnlessStaff($request);
        $tenantId = $this->requireTenantId($request);
        $this->assertAssessmentTenant($request, $officialAssessment);

        $rows = $request->validated('grades');
        $studentIds = collect($rows)->pluck('student_id')->map(fn ($id) => (int) $id)->unique()->values();
        $studentsCount = Student::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $studentIds)
            ->count();

        if ($studentsCount !== $studentIds->count()) {
            return $this->error('Há alunos que não pertencem ao tenant da avaliação.', null, 422);
        }

        $invalidStudents = Student::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $studentIds)
            ->whereDoesntHave('enrollments', function ($q) use ($officialAssessment, $tenantId) {
                $q->where('tenant_id', $tenantId)
                    ->whereNotIn('status', ['cancelled'])
                    ->forSchoolClass((int) $officialAssessment->school_class_id);
            })
            ->get(['id', 'name'])
            ->map(fn ($student) => [
                'student_id' => $student->id,
                'student_name' => $student->name,
            ])
            ->values()
            ->all();

        if ($invalidStudents !== []) {
            return $this->error(
                'Há alunos sem matrícula ativa na turma da avaliação.',
                ['invalid_students' => $invalidStudents],
                422
            );
        }

        $maxScore = (float) $officialAssessment->max_score;

        DB::transaction(function () use ($rows, $officialAssessment, $tenantId, $maxScore) {
            $lockedAssessment = OfficialAssessment::query()
                ->whereKey($officialAssessment->id)
                ->where('tenant_id', $tenantId)
                ->with('subjects:id')
                ->lockForUpdate()
                ->first();

            if (! $lockedAssessment) {
                abort(404, 'Avaliação não encontrada.');
            }

            if ($lockedAssessment->status === OfficialAssessment::STATUS_PUBLISHED) {
                abort(422, 'Avaliação já publicada. Não é possível alterar notas.');
            }

            $lockedSubjectIds = $lockedAssessment->linkedSubjectIds()->all();

            foreach ($rows as $row) {
                $studentId = (int) $row['student_id'];
                $subjectId = array_key_exists('subject_id', $row) && $row['subject_id'] !== null
                    ? (int) $row['subject_id']
                    : null;

                if ($subjectId !== null && $lockedSubjectIds !== [] && ! in_array($subjectId, $lockedSubjectIds, true)) {
                    abort(422, "A disciplina {$subjectId} não pertence a esta avaliação.");
                }
                $grade = array_key_exists('grade', $row) ? $row['grade'] : null;
                $isAbsent = (bool) ($row['is_absent'] ?? false);
                $enrollmentId = $row['enrollment_id'] ?? null;

                if ($grade !== null && (float) $grade > $maxScore) {
                    abort(422, "Nota do aluno {$studentId} excede a nota máxima ({$maxScore}).");
                }

                if ($enrollmentId !== null) {
                    $enrollment = Enrollment::query()->find($enrollmentId);
                    if (
                        ! $enrollment
                        || (int) $enrollment->student_id !== $studentId
                        || (int) $enrollment->tenant_id !== $tenantId
                        || ! Enrollment::query()
                            ->whereKey($enrollmentId)
                            ->forSchoolClass((int) $lockedAssessment->school_class_id)
                            ->exists()
                    ) {
                        abort(422, "Matrícula inválida para o aluno {$studentId}.");
                    }
                }

                $gradeRow = OfficialAssessmentGrade::query()->firstOrNew([
                    'official_assessment_id' => $lockedAssessment->id,
                    'student_id' => $studentId,
                ]);

                $gradeRow->tenant_id = $tenantId;
                $gradeRow->subject_id = $subjectId;
                $gradeRow->enrollment_id = $enrollmentId;
                $gradeRow->grade = $isAbsent ? null : $grade;
                $gradeRow->is_absent = $isAbsent;
                $gradeRow->notes = $row['notes'] ?? null;
                $gradeRow->graded_at = now();

                $gradeRow->save();
            }
        });

        $officialAssessment->refresh()->load([
            'grades.student:id,name,enrollment_number',
            'grades.subject:id,name,icon,color',
        ]);

        return $this->success([
            'assessment' => new OfficialAssessmentResource($officialAssessment),
            'grades' => OfficialAssessmentGradeResource::collection($officialAssessment->grades),
        ], 'Notas salvas com sucesso.');
    }

    public function publish(Request $request, OfficialAssessment $officialAssessment): JsonResponse
    {
        $this->denyUnlessStaff($request);
        $this->assertAssessmentTenant($request, $officialAssessment);

        if ($officialAssessment->grades()->count() === 0) {
            return $this->error('Lance ao menos uma nota antes de publicar.', null, 422);
        }

        $officialAssessment->update([
            'status' => OfficialAssessment::STATUS_PUBLISHED,
        ]);

        return $this->success(
            new OfficialAssessmentResource($officialAssessment->fresh()->loadCount('grades')),
            'Avaliação publicada com sucesso.'
        );
    }

    public function studentReportCard(Request $request, Student $student): JsonResponse
    {
        $this->denyUnlessStaff($request);
        $tenantId = $this->requireTenantId($request);

        if ((int) $student->tenant_id !== $tenantId) {
            return $this->error('Aluno não pertence ao tenant informado.', null, 403);
        }

        $grades = OfficialAssessmentGrade::query()
            ->where('tenant_id', $tenantId)
            ->where('student_id', $student->id)
            ->whereHas('assessment', function ($q) {
                $q->where('status', OfficialAssessment::STATUS_PUBLISHED)
                    ->where('counts_towards_report_card', true);
            })
            ->with([
                'assessment.schoolClass:id,name',
                'subject:id,name,icon,color',
            ])
            ->orderByDesc('id')
            ->get();

        $validGrades = $grades->where('is_absent', false)->whereNotNull('grade');
        $weightedSum = $validGrades->sum(fn ($g) => (float) $g->grade * (float) $g->assessment->weight);
        $weights = $validGrades->sum(fn ($g) => (float) $g->assessment->weight);
        $average = $weights > 0 ? round($weightedSum / $weights, 2) : null;

        $bySubject = $grades
            ->groupBy('subject_id')
            ->map(function ($subjectGrades, $subjectId) {
                $valid = $subjectGrades->where('is_absent', false)->whereNotNull('grade');
                $sum = $valid->sum(fn ($g) => (float) $g->grade * (float) $g->assessment->weight);
                $w = $valid->sum(fn ($g) => (float) $g->assessment->weight);
                $subject = $subjectGrades->first()?->subject;

                return [
                    'subject_id' => (int) $subjectId,
                    'subject' => $subject ? [
                        'id' => $subject->id,
                        'name' => $subject->name,
                        'icon' => $subject->icon,
                        'color' => $subject->color,
                    ] : null,
                    'grades_count' => $subjectGrades->count(),
                    'absences_count' => $subjectGrades->where('is_absent', true)->count(),
                    'weighted_average' => $w > 0 ? round($sum / $w, 2) : null,
                ];
            })
            ->values()
            ->all();

        return $this->success([
            'student' => [
                'id' => $student->id,
                'name' => $student->name,
                'enrollment_number' => $student->enrollment_number,
            ],
            'summary' => [
                'assessments_count' => $grades->count(),
                'absences_count' => $grades->where('is_absent', true)->count(),
                'weighted_average' => $average,
                'by_subject' => $bySubject,
            ],
            'grades' => OfficialAssessmentGradeResource::collection($grades),
        ]);
    }

    private function assertAssessmentTenant(Request $request, OfficialAssessment $assessment): void
    {
        $tenantId = $this->requireTenantId($request);
        if ((int) $assessment->tenant_id !== $tenantId) {
            abort(403, 'Avaliação não pertence ao tenant informado.');
        }
    }

    private function assertRelatedEntitiesBelongToTenant(int $tenantId, array $data): void
    {
        $checks = [
            ['key' => 'course_id', 'table' => 'courses', 'tenant_scoped' => true],
            ['key' => 'school_class_id', 'table' => 'school_classes', 'tenant_scoped' => true],
            ['key' => 'subject_id', 'table' => 'subjects', 'tenant_scoped' => true],
            ['key' => 'exam_type_id', 'table' => 'exam_types', 'tenant_scoped' => false],
        ];

        foreach ($checks as $check) {
            $value = $data[$check['key']] ?? null;
            if ($value === null) {
                continue;
            }

            $query = DB::table($check['table'])->where('id', $value);
            if (($check['tenant_scoped'] ?? true) === true) {
                $query->where('tenant_id', $tenantId);
            }

            if (! $query->exists()) {
                abort(422, "{$check['key']} não pertence ao tenant informado.");
            }
        }
    }

    /**
     * @param  array<string, mixed>  $data
     * @return list<int>
     */
    private function normalizeSubjectIds(array $data): array
    {
        $ids = collect($data['subject_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        $legacyId = isset($data['subject_id']) ? (int) $data['subject_id'] : 0;
        if ($legacyId > 0) {
            $ids = $ids->push($legacyId)->unique()->values();
        }

        return $ids->all();
    }

    /**
     * @param  list<int>  $subjectIds
     */
    private function syncSubjects(OfficialAssessment $assessment, array $subjectIds): void
    {
        $ids = collect($subjectIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        $assessment->subjects()->sync(
            $ids->mapWithKeys(fn (int $id) => [$id => []])->all()
        );

        $assessment->forceFill(['subject_id' => $ids->first()])->save();
    }

    /**
     * @param  list<int>  $subjectIds
     */
    private function assertSubjectIdsBelongToTenant(int $tenantId, array $subjectIds): void
    {
        if ($subjectIds === []) {
            return;
        }

        $valid = DB::table('subjects')
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $subjectIds)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if (array_diff($subjectIds, $valid) !== []) {
            abort(422, 'Uma ou mais disciplinas não pertencem ao tenant informado.');
        }
    }

    private function denyUnlessStaff(Request $request): void
    {
        $role = $request->user()?->role;
        if (! in_array($role, ['admin', 'super_admin', 'secretaria', 'professor'], true)) {
            abort(403, 'Sem permissão para gerenciar avaliações oficiais.');
        }
    }
}
