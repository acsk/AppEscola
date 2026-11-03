<?php

namespace App\Http\Controllers\Api\Bi;

use App\Services\Bi\BiAccessScope;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Aprovações comprovadas (student_exam_outcomes): cadastro da coordenação, com evidência e consentimento
 * para uso em divulgação. No relatório de Resultados entram só agregadas.
 */
class BiExamOutcomeController extends BiController
{
    private const RESULTS = ['approved', 'classified', 'not_approved'];

    public function index(Request $request): JsonResponse
    {
        $scope = $this->coordination($request);
        $year = $request->validate(['year' => ['nullable', 'integer', 'between:2000,2100']])['year'] ?? null;

        $items = DB::table('student_exam_outcomes as o')
            ->join('students as s', 's.id', '=', 'o.student_id')
            ->leftJoin('exam_types as t', 't.id', '=', 'o.exam_type_id')
            ->where('o.tenant_id', $scope->tenantId)
            ->whereNull('o.deleted_at')
            ->when($year, fn ($q) => $q->where('o.year', $year))
            ->orderByDesc('o.year')
            ->orderBy('s.name')
            ->limit(500)
            ->get(['o.*', 's.name as student', 't.label as exam_type']);

        return $this->success(['items' => $items], 'Aprovações carregadas.');
    }

    public function store(Request $request): JsonResponse
    {
        $scope = $this->coordination($request);
        $data = $this->validated($request, $scope, true);

        $id = DB::table('student_exam_outcomes')->insertGetId($data + [
            'tenant_id' => $scope->tenantId,
            'recorded_by' => $scope->userId,
            'consent_at' => ! empty($data['consent_publish']) ? now() : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->created(['id' => $id], 'Resultado registrado.');
    }

    public function update(Request $request, int $outcome): JsonResponse
    {
        $scope = $this->coordination($request);
        $row = $this->find($scope, $outcome);
        $data = $this->validated($request, $scope, false);
        if (array_key_exists('consent_publish', $data) && (bool) $data['consent_publish'] !== (bool) $row->consent_publish) {
            $data['consent_at'] = $data['consent_publish'] ? now() : null;
        }

        DB::table('student_exam_outcomes')->where('id', $outcome)->update($data + ['updated_at' => now()]);

        return $this->success(['id' => $outcome], 'Resultado atualizado.');
    }

    public function destroy(Request $request, int $outcome): JsonResponse
    {
        $scope = $this->coordination($request);
        $this->find($scope, $outcome);
        DB::table('student_exam_outcomes')->where('id', $outcome)->update(['deleted_at' => now()]);

        return $this->deleted('Resultado removido.');
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, BiAccessScope $scope, bool $creating): array
    {
        $req = $creating ? 'required' : 'sometimes';

        return $request->validate([
            'student_id' => [$req, 'integer', Rule::exists('students', 'id')->where('tenant_id', $scope->tenantId)->whereNull('deleted_at')],
            'exam_type_id' => ['nullable', 'integer', Rule::exists('exam_types', 'id')],
            'exam_name' => [$req, 'string', 'max:150'],
            'year' => [$req, 'integer', 'between:2000,2100'],
            'result' => [$req, Rule::in(self::RESULTS)],
            'position' => ['nullable', 'integer', 'min:1'],
            'evidence_url' => ['nullable', 'url', 'max:500'],
            'evidence_note' => ['nullable', 'string', 'max:500'],
            'consent_publish' => ['boolean'],
        ], ['student_id.exists' => 'Aluno não encontrado nesta escola.']);
    }

    private function find(BiAccessScope $scope, int $id): object
    {
        $row = DB::table('student_exam_outcomes')->where('tenant_id', $scope->tenantId)->whereNull('deleted_at')->where('id', $id)->first();
        if (! $row) {
            throw new HttpResponseException($this->error('Resultado não encontrado.', null, 404));
        }

        return $row;
    }

    private function coordination(Request $request): BiAccessScope
    {
        $scope = $this->scope($request);
        if (! $scope->isTenantWide()) {
            throw new HttpResponseException($this->forbidden('Somente a coordenação gerencia as aprovações.'));
        }

        return $scope;
    }
}
