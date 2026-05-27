<?php

namespace App\Console\Commands;

use App\Models\Student;
use App\Services\StudentAppAccessDiagnosticService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class DebugStudentAppAccessCommand extends Command
{
    protected $signature = 'students:debug-app-access
                            {--tenant= : ID do tenant}
                            {--student= : ID de um aluno para detalhe completo}
                            {--limit=30 : Quantidade de amostras na listagem}
                            {--json : Saída apenas JSON}
                            {--save= : Grava JSON em storage/logs ou caminho informado}';

    protected $description = 'Diagnóstico: alunos sem usuário de app vs matrículas/cobranças pagas (migração)';

    public function handle(StudentAppAccessDiagnosticService $diagnostic): int
    {
        $tenantId = $this->option('tenant') !== null ? (int) $this->option('tenant') : null;
        $studentId = $this->option('student') !== null ? (int) $this->option('student') : null;
        $limit = max(1, min(200, (int) $this->option('limit')));

        $report = $diagnostic->report($tenantId, $studentId, $limit);

        if ($studentId !== null) {
            $student = Student::query()->find($studentId);
            if (! $student) {
                $this->error("Aluno #{$studentId} não encontrado.");

                return self::FAILURE;
            }
            if ($tenantId !== null && (int) $student->tenant_id !== $tenantId) {
                $this->error("Aluno #{$studentId} não pertence ao tenant {$tenantId}.");

                return self::FAILURE;
            }
            $report['student_detail'] = $diagnostic->studentDetail($student);
        }

        $savePath = $this->resolveSavePath((string) $this->option('save'), $tenantId, $studentId);

        if ($savePath !== null) {
            File::ensureDirectoryExists(dirname($savePath));
            File::put($savePath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $this->info("JSON salvo em: {$savePath}");
        }

        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

            return self::SUCCESS;
        }

        $this->printHumanReport($report);

        $this->newLine();
        $this->line('Exportar: --json ou --save=student-app-access-debug.json');

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $report
     */
    private function printHumanReport(array $report): void
    {
        $summary = $report['summary'] ?? [];
        $filters = $report['filters'] ?? [];

        $this->info('=== Diagnóstico: acesso ao app (alunos) ===');
        $this->line('Gerado em: ' . ($report['generated_at'] ?? '—'));
        $this->line('Filtros: tenant=' . ($filters['tenant_id'] ?? 'todos') . ', student=' . ($filters['student_id'] ?? 'todos'));
        $this->newLine();

        $this->table(
            ['Métrica', 'Valor'],
            [
                ['Alunos (total)', $summary['students_total'] ?? 0],
                ['Com usuário de app', $summary['with_app_user'] ?? 0],
                ['Sem usuário de app', $summary['without_app_user'] ?? 0],
                ['user_id órfão (usuário apagado)', $summary['orphan_user_id'] ?? 0],
                ['Matrícula ativa + sem usuário', $summary['with_active_enrollment_without_user'] ?? 0],
                ['Taxa matrícula PAGA + sem usuário', $summary['with_paid_enrollment_fee_without_user'] ?? 0],
                ['Qualquer cobrança PAGA + sem usuário', $summary['with_any_paid_invoice_without_user'] ?? 0],
            ]
        );

        $byStatus = $summary['without_user_by_status'] ?? [];
        if ($byStatus !== []) {
            $this->newLine();
            $this->info('Sem usuário — por status do aluno:');
            foreach ($byStatus as $status => $count) {
                $this->line("  • {$status}: {$count}");
            }
        }

        $conclusion = $report['conclusion'] ?? [];
        if ($conclusion !== []) {
            $this->newLine();
            $this->info('Conclusão:');
            foreach ($conclusion as $key => $line) {
                $this->line("  [{$key}] {$line}");
            }
        }

        $paths = $report['where_user_is_created'] ?? [];
        if ($paths !== []) {
            $this->newLine();
            $this->info('Onde o código cria (ou não) usuário:');
            foreach ($paths as $flow => $note) {
                $this->line("  • {$flow}");
                $this->line("    → {$note}");
            }
        }

        $samples = $report['samples_without_user'] ?? [];
        if ($samples !== []) {
            $this->newLine();
            $this->info('Amostra — alunos sem usuário:');
            $this->table(
                ['ID', 'Nome', 'Matrícula', 'Status', 'Matr. ativas', 'Taxa paga?', 'Login seria'],
                array_map(fn (array $row) => [
                    $row['id'],
                    mb_substr((string) $row['name'], 0, 28),
                    $row['enrollment_number'] ?? '—',
                    $row['status'],
                    $row['active_enrollments'],
                    ($row['enrollment_fee_paid'] ?? false) ? 'sim' : 'não',
                    $row['would_login_with'],
                ], $samples)
            );
        }

        $detail = $report['student_detail'] ?? null;
        if (is_array($detail)) {
            $this->newLine();
            $this->info('Detalhe do aluno #' . ($detail['student']['id'] ?? '?'));
            $this->line('has_app_user: ' . (($detail['has_app_user'] ?? false) ? 'sim' : 'não'));
            if (! empty($detail['user'])) {
                $this->line('user email: ' . ($detail['user']['email'] ?? '—'));
            }
            foreach ($detail['recommended_actions'] ?? [] as $action) {
                $this->line('  → ' . $action);
            }
        }
    }

    private function resolveSavePath(string $option, ?int $tenantId, ?int $studentId): ?string
    {
        if ($option === '') {
            return null;
        }

        if ($option === '1' || $option === 'true') {
            $suffix = $studentId ?? $tenantId ?? 'all';

            return storage_path('logs/student-app-access-debug-' . $suffix . '-' . now()->format('Ymd-His') . '.json');
        }

        if (! str_starts_with($option, '/')) {
            return storage_path('logs/' . ltrim($option, '/'));
        }

        return $option;
    }
}
