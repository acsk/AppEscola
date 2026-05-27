<?php

namespace App\Console\Commands;

use App\Models\Student;
use App\Services\StudentAppAccessService;
use Illuminate\Console\Command;
use Throwable;

class ProvisionStudentAppUsersCommand extends Command
{
    protected $signature = 'students:provision-users
                            {--tenant= : Filtra por ID do tenant}
                            {--student= : Provisiona apenas um aluno (ID)}
                            {--dry-run : Lista candidatos sem gravar}
                            {--show-passwords : Exibe a senha inicial gerada}';

    protected $description = 'Cria usuários de acesso ao app para alunos sem user_id vinculado';

    public function handle(StudentAppAccessService $service): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $showPasswords = (bool) $this->option('show-passwords');
        $tenantId = $this->option('tenant') !== null ? (int) $this->option('tenant') : null;
        $studentId = $this->option('student') !== null ? (int) $this->option('student') : null;

        $query = Student::query()
            ->where(function ($q) {
                $q->whereNull('user_id')
                    ->orWhereDoesntHave('user');
            })
            ->orderBy('tenant_id')
            ->orderBy('id');

        if ($tenantId !== null) {
            $query->where('tenant_id', $tenantId);
        }

        if ($studentId !== null) {
            $query->whereKey($studentId);
        }

        $candidates = $query->get();

        if ($candidates->isEmpty()) {
            $this->info('Nenhum aluno pendente de provisionamento.');

            return self::SUCCESS;
        }

        $this->info('Alunos sem acesso ao app: ' . $candidates->count());

        if ($dryRun) {
            $this->table(
                ['id', 'tenant', 'nome', 'matrícula', 'nascimento'],
                $candidates->map(fn (Student $s) => [
                    $s->id,
                    $s->tenant_id ?? '—',
                    $s->name,
                    $s->enrollment_number ?? '(será gerada)',
                    $s->birth_date?->format('d/m/Y') ?? '—',
                ])->all()
            );
            $this->warn('Modo dry-run: nenhuma alteração foi feita.');

            return self::SUCCESS;
        }

        $ok = 0;
        $failed = 0;

        foreach ($candidates as $student) {
            try {
                $result = $service->provision($student);
                $ok++;

                $line = "OK  #{$student->id} {$student->name} — login: {$result['enrollment_number']}";
                if ($showPasswords) {
                    $line .= " — senha: {$result['initial_password']}";
                }
                $this->line($line);
            } catch (Throwable $e) {
                $failed++;
                $this->error("Falha #{$student->id} {$student->name}: {$e->getMessage()}");
            }
        }

        $this->newLine();
        $this->info("Provisionados: {$ok}");
        if ($failed > 0) {
            $this->warn("Falhas: {$failed}");

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
