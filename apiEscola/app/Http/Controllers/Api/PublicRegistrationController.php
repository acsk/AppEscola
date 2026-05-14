<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Guardian;
use App\Models\Student;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PublicRegistrationController extends Controller
{
    /**
     * Cadastro público de aluno + responsável via app mobile.
     *
     * Rota pública — sem autenticação.
     * O tenant é identificado pelo slug passado na URL.
     * O aluno é criado com status "pending" aguardando aprovação da escola.
     *
     * POST /api/public/{tenant_slug}/register
     */
    public function register(Request $request, string $tenantSlug): JsonResponse
    {
        $tenant = Tenant::where('slug', $tenantSlug)->first();

        if (! $tenant) {
            return response()->json([
                'type'    => 'error',
                'message' => 'Escola não encontrada.',
                'body'    => null,
            ], 404);
        }

        $tenantId = $tenant->id;

        $data = $request->validate([
            // Dados do aluno
            'student.name'       => ['required', 'string', 'max:255'],
            'student.birth_date' => ['nullable', 'date', 'before:today'],
            'student.document'   => [
                'nullable',
                'string',
                'max:20',
                Rule::unique('students', 'document')->where('tenant_id', $tenantId),
            ],
            'student.email'      => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('students', 'email')->where('tenant_id', $tenantId),
            ],
            'student.phone'      => ['nullable', 'string', 'max:20'],
            'student.is_minor'   => ['nullable', 'boolean'],

            // Cursos desejados (multiseleção)
            'course_ids'         => ['nullable', 'array', 'min:1'],
            'course_ids.*'       => ['integer', Rule::exists('courses', 'id')->where('tenant_id', $tenantId)],

            // Compatibilidade retroativa com payload antigo
            'course_id'          => ['nullable', Rule::exists('courses', 'id')->where('tenant_id', $tenantId)],

            // Responsável (obrigatório quando aluno for menor)
            'guardian.name'         => ['required', 'string', 'max:255'],
            'guardian.document'     => [
                'nullable',
                'string',
                'max:20',
            ],
            'guardian.email'        => ['nullable', 'email', 'max:255'],
            'guardian.phone'        => ['nullable', 'string', 'max:20'],
            'guardian.relationship' => ['nullable', 'exists:domain_guardian_relationships,slug'],
        ]);

        // Normaliza CPF/CNPJ removendo caracteres não numéricos
        $studentDocument  = $this->normalizeDocument($data['student']['document'] ?? '');
        $guardianDocument = $this->normalizeDocument($data['guardian']['document'] ?? '');

        $courseIds = collect($data['course_ids'] ?? [])
            ->filter(fn ($id) => ! is_null($id) && $id !== '')
            ->map(fn ($id) => (int) $id)
            ->values();

        if ($courseIds->isEmpty() && isset($data['course_id'])) {
            $courseIds = collect([(int) $data['course_id']]);
        }

        $courseIds = $courseIds->unique()->values();

        $result = DB::transaction(function () use ($data, $tenantId, $studentDocument, $guardianDocument, $courseIds) {
            // --- Cria o aluno ---
            $student = Student::create([
                'tenant_id'         => $tenantId,
                'name'              => $data['student']['name'],
                'birth_date'        => $data['student']['birth_date'] ?? null,
                'document'          => $studentDocument !== '' ? $studentDocument : null,
                'email'             => $data['student']['email'] ?? null,
                'phone'             => $data['student']['phone'] ?? null,
                'is_minor'          => (bool) ($data['student']['is_minor'] ?? false),
                'status'            => 'inactive',
                // Mantém compatibilidade legada: armazena o primeiro curso selecionado
                'desired_course_id' => $courseIds->first(),
            ]);

            // Gera matrícula no padrão do painel (ano + ID com 5 dígitos)
            $student->update([
                'enrollment_number' => $this->generateStudentEnrollmentNumber($student),
            ]);

            // --- Cria ou reusa o responsável ---
            $guardian = null;
            if ($guardianDocument !== '') {
                $guardian = Guardian::withTrashed()
                    ->where('tenant_id', $tenantId)
                    ->where('document', $guardianDocument)
                    ->first();
            }

            if ($guardian) {
                if ($guardian->trashed()) {
                    $guardian->restore();
                }
                $guardian->update([
                    'name'         => $data['guardian']['name'],
                    'email'        => $data['guardian']['email']        ?? $guardian->email,
                    'phone'        => $data['guardian']['phone']        ?? $guardian->phone,
                    'relationship' => $data['guardian']['relationship'] ?? $guardian->relationship,
                ]);
            } else {
                $guardian = Guardian::create([
                    'tenant_id'    => $tenantId,
                    'name'         => $data['guardian']['name'],
                    'document'     => $guardianDocument !== '' ? $guardianDocument : null,
                    'email'        => $data['guardian']['email']        ?? null,
                    'phone'        => $data['guardian']['phone']        ?? null,
                    'relationship' => $data['guardian']['relationship'] ?? null,
                ]);
            }

            // Vincula responsável ao aluno
            $student->guardians()->syncWithoutDetaching([
                $guardian->id => [
                    'tenant_id'                  => $tenantId,
                    'is_financial_responsible'   => true,
                    'is_pedagogical_responsible' => true,
                    'can_access_portal'          => false,
                ],
            ]);

            if ($courseIds->isNotEmpty()) {
                $desiredCoursesPivot = [];

                foreach ($courseIds as $courseId) {
                    $desiredCoursesPivot[$courseId] = ['tenant_id' => $tenantId];
                }

                $student->desiredCourses()->sync($desiredCoursesPivot);
            }

            return compact('student', 'guardian');
        });

        $student  = $result['student'];
        $guardian = $result['guardian'];

        $desiredCourses = Course::whereIn('id', $courseIds)
            ->get(['id', 'name'])
            ->keyBy('id');

        $selectedCourseIds = $courseIds
            ->filter(fn (int $id) => $desiredCourses->has($id))
            ->values();

        $primaryCourse = $student->desired_course_id
            ? $desiredCourses->get((int) $student->desired_course_id)
            : null;

        return $this->success([
            'student' => [
                'id'                => $student->id,
                'enrollment_number' => $student->enrollment_number,
                'name'              => $student->name,
                'email'             => $student->email,
                'status'            => $student->status,
                'desired_courses'   => $selectedCourseIds->map(fn (int $id) => [
                    'id' => $id,
                    'name' => $desiredCourses[$id]->name,
                ])->values(),
            ],
            'guardian' => [
                'id'           => $guardian->id,
                'name'         => $guardian->name,
                'relationship' => $guardian->relationship,
            ],
            'message' => 'Cadastro enviado com sucesso! A escola irá entrar em contato para confirmar a matrícula.',
        ], 'Pré-cadastro realizado com sucesso.', 201);
    }

    /**
     * Retorna os cursos disponíveis de um tenant para popular o select no app.
     *
     * GET /api/public/{tenant_slug}/courses
     */
    public function courses(Request $request, string $tenantSlug): JsonResponse
    {
        $tenant = Tenant::where('slug', $tenantSlug)->first();

        if (! $tenant) {
            return response()->json([
                'type'    => 'error',
                'message' => 'Escola não encontrada.',
                'body'    => null,
            ], 404);
        }

        $courses = Course::where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->orderBy('name')
            ->get(['id', 'name']);

        return $this->success($courses);
    }

    private function normalizeDocument(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?? '';
    }

    private function generateStudentEnrollmentNumber(Student $student): string
    {
        return now()->year . str_pad((string) $student->id, 5, '0', STR_PAD_LEFT);
    }
}
