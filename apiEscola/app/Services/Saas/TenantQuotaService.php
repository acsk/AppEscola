<?php

namespace App\Services\Saas;

use App\Models\AiUsageLog;
use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\QuestionGenerationJob;
use App\Models\QuestionImportDraft;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\TenantStorageUsage;
use App\Models\User;
use App\Support\BusinessDate;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\UploadedFile;

/**
 * Consumo × limite contratado. Ao atingir o limite só bloqueia o que expande o uso (cadastrar mais);
 * editar, consultar e excluir continuam liberados.
 */
class TenantQuotaService
{
    /** Recurso → [rótulo, unidade, mensal?]. Recursos mensais zeram no início de cada mês. */
    public const RESOURCES = [
        'students' => ['Alunos ativos', 'alunos', false],
        'users' => ['Usuários da equipe', 'usuários', false],
        'teachers' => ['Professores', 'professores', false],
        'classes' => ['Turmas', 'turmas', false],
        'courses' => ['Cursos', 'cursos', false],
        'questions' => ['Questões cadastradas', 'questões', false],
        'exams' => ['Simulados', 'simulados', false],
        'ai_question_generations' => ['Gerações de questões com IA (mês)', 'gerações', true],
        'document_processing' => ['Processamentos de documentos (mês)', 'documentos', true],
        'ai_requests' => ['Requisições de IA (mês)', 'requisições', true],
        'storage_mb' => ['Armazenamento (MB)', 'MB', false],
    ];

    public const WARNING_PERCENT = 80;
    public const CRITICAL_PERCENT = 95;

    public function __construct(private readonly SaasEntitlementService $entitlements)
    {
    }

    public function usage(int $tenantId, string $resource): int
    {
        $monthStart = BusinessDate::today()->startOfMonth();

        return match ($resource) {
            'students' => Student::query()->where('tenant_id', $tenantId)->where('status', 'active')->count(),
            'users' => User::query()->where('tenant_id', $tenantId)->whereNotIn('role', ['aluno', 'responsavel', 'super_admin'])->count(),
            'teachers' => User::query()->where('tenant_id', $tenantId)->where('role', 'professor')->count(),
            'classes' => SchoolClass::query()->where('tenant_id', $tenantId)->count(),
            'courses' => Course::query()->where('tenant_id', $tenantId)->count(),
            'questions' => ExamQuestion::query()->where('tenant_id', $tenantId)->count(),
            'exams' => Exam::query()->where('tenant_id', $tenantId)->count(),
            'ai_question_generations' => QuestionGenerationJob::query()->where('tenant_id', $tenantId)->where('created_at', '>=', $monthStart)->count(),
            'document_processing' => QuestionImportDraft::query()->where('tenant_id', $tenantId)->where('created_at', '>=', $monthStart)->count(),
            'ai_requests' => AiUsageLog::query()->where('tenant_id', $tenantId)->where('created_at', '>=', $monthStart)->count(),
            // Medido uma vez por dia (saas:measure-storage); uploads do dia ainda não entram.
            'storage_mb' => (int) ceil((int) TenantStorageUsage::query()->where('tenant_id', $tenantId)->value('bytes') / 1048576),
            default => 0,
        };
    }

    /** @return list<array{resource: string, label: string, unit: string, monthly: bool, usage: int, limit: int|null, percent: float|null, level: string}> */
    public function report(int $tenantId): array
    {
        $rows = [];
        foreach (self::RESOURCES as $resource => [$label, $unit, $monthly]) {
            $usage = $this->usage($tenantId, $resource);
            $limit = $this->entitlements->limit($tenantId, $resource);
            $percent = $limit === null ? null : ($limit === 0 ? 100.0 : round($usage / $limit * 100, 1));
            $rows[] = [
                'resource' => $resource,
                'label' => $label,
                'unit' => $unit,
                'monthly' => $monthly,
                'usage' => $usage,
                'limit' => $limit,
                'percent' => $percent,
                'level' => $this->level($percent),
            ];
        }

        return $rows;
    }

    /** Só os recursos em alerta (≥ 80%), para o aviso do painel do tenant. */
    public function alerts(int $tenantId): array
    {
        return array_values(array_filter($this->report($tenantId), fn ($row) => $row['level'] !== 'ok'));
    }

    public function allows(int $tenantId, string $resource, int $amount = 1): bool
    {
        $limit = $this->entitlements->limit($tenantId, $resource);

        return $limit === null || $this->usage($tenantId, $resource) + $amount <= $limit;
    }

    /** Bloqueia a criação quando passaria do limite (HTTP 422 com code quota_exceeded). */
    public function assertCanAdd(int $tenantId, string $resource, int $amount = 1): void
    {
        $limit = $this->entitlements->limit($tenantId, $resource);
        if ($limit === null) {
            return;
        }
        $usage = $this->usage($tenantId, $resource);
        if ($usage + $amount <= $limit) {
            return;
        }

        [$label, $unit] = self::RESOURCES[$resource];
        throw new HttpResponseException(response()->json([
            'type' => 'error',
            'message' => "Limite do plano atingido: {$usage} de {$limit} {$unit}. Os dados existentes continuam disponíveis; para cadastrar mais, fale com o suporte para ampliar o plano.",
            'body' => ['code' => 'quota_exceeded', 'resource' => $resource, 'label' => $label, 'usage' => $usage, 'limit' => $limit],
        ], 422));
    }

    /** Upload: bloqueia se o arquivo passaria do limite de armazenamento do plano. */
    public function assertCanStore(int $tenantId, ?UploadedFile $file): void
    {
        if ($file) {
            $this->assertCanAdd($tenantId, 'storage_mb', (int) ceil($file->getSize() / 1048576));
        }
    }

    private function level(?float $percent): string
    {
        return match (true) {
            $percent === null => 'ok',
            $percent >= 100 => 'reached',
            $percent >= self::CRITICAL_PERCENT => 'critical',
            $percent >= self::WARNING_PERCENT => 'warning',
            default => 'ok',
        };
    }
}
