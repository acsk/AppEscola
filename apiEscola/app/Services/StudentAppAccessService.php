<?php

namespace App\Services;

use App\Models\Student;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class StudentAppAccessService
{
    public function hasAppAccess(Student $student): bool
    {
        if ($student->user_id === null) {
            return false;
        }

        return User::query()->whereKey($student->user_id)->exists();
    }

    /**
     * Cria usuário somente se o aluno ainda não tiver. Retorna true quando provisionou.
     *
     * @throws RuntimeException
     */
    public function provisionIfNeeded(Student $student): bool
    {
        if ($this->hasAppAccess($student)) {
            return false;
        }

        $this->provision($student);

        return true;
    }

    /**
     * Cria usuário de login do app (matrícula + senha inicial) e vincula ao aluno.
     *
     * @return array{user: User, enrollment_number: string, initial_password: string}
     */
    public function provision(Student $student): array
    {
        $student->refresh();

        if ($this->hasAppAccess($student)) {
            throw new RuntimeException('Este aluno já possui usuário de acesso ao app.');
        }

        $tenantId = $student->tenant_id;
        if ($tenantId === null) {
            throw new RuntimeException('Aluno sem tenant associado.');
        }

        $enrollmentNumber = $this->resolveEnrollmentNumber($student);
        $initialPassword = $this->initialPassword($student);
        $email = $enrollmentNumber . '@interno';

        $existingUser = User::withTrashed()->where('email', $email)->first();

        if ($existingUser) {
            return $this->linkExistingUser($student, $existingUser, $enrollmentNumber, $tenantId);
        }

        $user = User::create([
            'tenant_id'                => $tenantId,
            'name'                     => $student->name,
            'email'                    => $email,
            'password'                 => Hash::make($initialPassword),
            'role'                     => 'aluno',
            'status'                   => 'active',
            'password_change_required' => true,
        ]);

        $student->update([
            'enrollment_number' => $enrollmentNumber,
            'user_id'           => $user->id,
        ]);

        return [
            'user'               => $user,
            'enrollment_number'  => $enrollmentNumber,
            'initial_password'   => $initialPassword,
            'linked_existing'    => false,
        ];
    }

    /**
     * Vincula aluno a usuário @interno já existente (migração / cadastro duplicado).
     *
     * @return array{user: User, enrollment_number: string, initial_password: ?string, linked_existing: true}
     */
    private function linkExistingUser(
        Student $student,
        User $user,
        string $enrollmentNumber,
        int $tenantId
    ): array {
        $conflict = Student::query()
            ->where('user_id', $user->id)
            ->whereKeyNot($student->id)
            ->exists();

        if ($conflict) {
            throw new RuntimeException(
                "O e-mail {$user->email} já está vinculado a outro aluno."
            );
        }

        if (method_exists($user, 'trashed') && $user->trashed()) {
            $user->restore();
        }

        $user->update([
            'tenant_id' => $tenantId,
            'name'      => $student->name,
            'role'      => 'aluno',
            'status'    => 'active',
        ]);

        $student->update([
            'enrollment_number' => $enrollmentNumber,
            'user_id'           => $user->id,
        ]);

        return [
            'user'              => $user->fresh(),
            'enrollment_number' => $enrollmentNumber,
            'initial_password'  => null,
            'linked_existing'   => true,
        ];
    }

    public function resolveEnrollmentNumber(Student $student): string
    {
        if (filled($student->enrollment_number)) {
            return $student->enrollment_number;
        }

        return now()->year . str_pad((string) $student->id, 5, '0', STR_PAD_LEFT);
    }

    public function initialPassword(Student $student): string
    {
        if ($student->birth_date) {
            return $student->birth_date->format('dmY');
        }

        return 'Aluno@' . str_pad((string) $student->id, 4, '0', STR_PAD_LEFT);
    }
}
