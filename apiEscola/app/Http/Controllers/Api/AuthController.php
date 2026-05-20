<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use OpenApi\Attributes as OA;

class AuthController extends Controller
{
    #[OA\Post(
        path: '/api/login',
        tags: ['Auth'],
        summary: 'Autenticar usuário',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['login', 'password'],
                properties: [
                    new OA\Property(property: 'login', type: 'string', description: 'E-mail (admin/staff) ou número de matrícula (aluno)', example: '202600001'),
                    new OA\Property(property: 'password', type: 'string', format: 'password', example: '15052008'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Login bem-sucedido'),
            new OA\Response(response: 422, description: 'Credenciais inválidas'),
        ]
    )]
    public function login(LoginRequest $request): JsonResponse
    {
        $login = $request->login;

        if (str_contains($login, '@')) {
            // Login por e-mail (admin, secretaria, professor…)
            $user = User::where('email', $login)->first();
        } else {
            // Login por número de matrícula (aluno)
            $student = Student::where('enrollment_number', $login)->first();
            $user = $student?->user;
        }

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'login' => ['Credenciais inválidas.'],
            ]);
        }

        if ($user->status !== 'active') {
            return response()->json(['message' => 'Usuário inativo.'], 403);
        }

        $selectedTenantId = null;
        $abilities = ['*'];

        if ($user->isSuperAdmin() && $request->filled('tenant_id')) {
            $selectedTenantId = (int) $request->input('tenant_id');

            $tenantExists = Tenant::query()
                ->where('id', $selectedTenantId)
                ->where('status', 'active')
                ->exists();

            if (! $tenantExists) {
                throw ValidationException::withMessages([
                    'tenant_id' => ['Tenant inválido ou inativo.'],
                ]);
            }

            $abilities = ["tenant:{$selectedTenantId}"];
        }

        $token = $user->createToken('api-token', $abilities)->plainTextToken;

        $user->loadMissing(['tenant', 'student']);

        return response()->json([
            'user'                     => new UserResource($user),
            'token'                    => $token,
            'selected_tenant_id'       => $selectedTenantId,
            'password_change_required' => (bool) $user->password_change_required,
        ]);
    }

    #[OA\Get(
        path: '/api/me',
        tags: ['Auth'],
        summary: 'Dados do usuário autenticado',
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Dados do usuário'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->loadMissing(['tenant', 'student']);

        return response()->json(new UserResource($user));
    }

    #[OA\Post(
        path: '/api/logout',
        tags: ['Auth'],
        summary: 'Encerrar sessão',
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Logout realizado'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logout realizado com sucesso.']);
    }

    #[OA\Put(
        path: '/api/me/password',
        tags: ['Auth'],
        summary: 'Alterar senha do usuário autenticado',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['current_password', 'password', 'password_confirmation'],
                properties: [
                    new OA\Property(property: 'current_password', type: 'string', format: 'password'),
                    new OA\Property(property: 'password', type: 'string', format: 'password'),
                    new OA\Property(property: 'password_confirmation', type: 'string', format: 'password'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Senha alterada com sucesso'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function updatePassword(Request $request): JsonResponse
    {
        $request->validate([
            'current_password'      => ['required', 'string'],
            'password'              => ['required', 'string', 'min:8', 'confirmed'],
        ], [
            'current_password.required' => 'A senha atual é obrigatória.',
            'password.required'         => 'A nova senha é obrigatória.',
            'password.min'              => 'A nova senha deve ter pelo menos :min caracteres.',
            'password.confirmed'        => 'A confirmação da nova senha não confere.',
        ]);

        $user = $request->user();

        if (! Hash::check($request->current_password, $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Senha atual incorreta.'],
            ]);
        }

        $user->update([
            'password'                 => $request->password,
            'password_change_required' => false,
        ]);

        return response()->json(['message' => 'Senha alterada com sucesso.']);
    }
}
