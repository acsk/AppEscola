<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;

#[OA\Info(
    title: 'AppEscola API',
    version: '1.0.0',
    description: 'API REST do sistema multi-tenant AppEscola — gestão de escolas e cursinhos.',
    contact: new OA\Contact(email: 'contato@appescola.com.br')
)]
#[OA\Server(url: 'http://localhost:4000', description: 'Ambiente local')]
#[OA\SecurityScheme(
    securityScheme: 'sanctum',
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Informe o token retornado pelo endpoint /api/login'
)]
#[OA\Tag(name: 'Auth', description: 'Autenticação')]
#[OA\Tag(name: 'Tenants', description: 'Gestão de tenants/escolas (somente super_admin)')]
#[OA\Tag(name: 'Users', description: 'Gestão de usuários (super_admin e admin do tenant)')]
#[OA\Tag(name: 'Students', description: 'Alunos')]
#[OA\Tag(name: 'Guardians', description: 'Responsáveis')]
#[OA\Tag(name: 'Courses', description: 'Cursos')]
#[OA\Tag(name: 'Subjects', description: 'Disciplinas')]
#[OA\Tag(name: 'SchoolClasses', description: 'Turmas')]
#[OA\Tag(name: 'ClassSchedules', description: 'Horários de aulas')]
#[OA\Tag(name: 'StudentAttendances', description: 'Frequencia de alunos por turma e dia')]
#[OA\Tag(name: 'Enrollments', description: 'Matrículas')]
#[OA\Tag(name: 'Invoices', description: 'Cobranças')]
#[OA\Tag(name: 'TenantApiTokens', description: 'Tokens de API por tenant')]
#[OA\Tag(name: 'CoursePlans', description: 'Planos de cobrança por ciclo vinculados a cursos')]
#[OA\Tag(name: 'CourseBundles', description: 'Pacotes de cursos com preço diferenciado')]
#[OA\Tag(name: 'Domain', description: 'Tabelas de domínio / lookups para dropdowns')]
class SwaggerController extends Controller
{
}
