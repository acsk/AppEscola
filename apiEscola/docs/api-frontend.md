# API AppEscola — Guia para o Frontend

**Base URL:** `http://localhost:4000/api`  
**Documentação interativa (Swagger):** `http://localhost:4000/api/documentation`

---

## Sumário

1. [Autenticação e persistência do token](#1-autenticação-e-persistência-do-token)
2. [Headers obrigatórios](#2-headers-obrigatórios)
3. [Padrão de respostas e erros](#3-padrão-de-respostas-e-erros)
4. [Dados de domínio (lookups / dropdowns)](#4-dados-de-domínio-lookups--dropdowns)
5. [Alunos](#5-alunos)
6. [Responsáveis](#6-responsáveis)
7. [Vinculação aluno ↔ responsável](#7-vinculação-aluno--responsável)
8. [Cursos](#8-cursos)
9. [Disciplinas](#9-disciplinas)
10. [Turmas](#10-turmas)
11. [Horários de turma](#11-horários-de-turma)
12. [Matrículas](#12-matrículas)
13. [Cobranças (Invoices)](#13-cobranças-invoices)

---

## 1. Autenticação e persistência do token

### 1.1 Login

```http
POST /api/login
Content-Type: application/json
```

**Body:**
```json
{
  "email": "admin@cursinhoexemplo.com",
  "password": "123456"
}
```

**Resposta 200:**
```json
{
  "user": {
    "id": 1,
    "tenant_id": "cursinho-exemplo",
    "name": "Admin",
    "email": "admin@cursinhoexemplo.com",
    "role": "admin",
    "status": "active",
    "email_verified_at": "2026-04-28T00:00:00.000000Z",
    "created_at": "2026-04-28T00:00:00.000000Z",
    "updated_at": "2026-04-28T00:00:00.000000Z"
  },
  "token": "1|xxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

> O campo `token` é um **Bearer Token** do Laravel Sanctum. Ele não expira por padrão — é válido até o logout.

---

### 1.2 Persistência do token

Armazene o token e os dados do usuário logo após o login:

```js
// Exemplo com localStorage
const { user, token } = await response.json();

localStorage.setItem('auth_token', token);
localStorage.setItem('auth_user', JSON.stringify(user));
```

Na inicialização da aplicação, recupere o token e pré-configure o cliente HTTP:

```js
// Exemplo com axios
const token = localStorage.getItem('auth_token');
if (token) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}
```

---

### 1.3 Usuário autenticado

```http
GET /api/me
Authorization: Bearer {token}
```

Use para revalidar a sessão ao recarregar a app ou verificar se o token ainda é válido.

**Resposta 200:** mesmo objeto `user` do login.  
**Resposta 401:** token inválido ou expirado → redirecionar para login.

---

### 1.4 Logout

```http
POST /api/logout
Authorization: Bearer {token}
```

**Resposta 200:**
```json
{ "message": "Logout realizado com sucesso." }
```

Ao receber o 200, limpe o storage:
```js
localStorage.removeItem('auth_token');
localStorage.removeItem('auth_user');
```

---

## 2. Headers obrigatórios

Todas as requisições autenticadas devem enviar:

```
Authorization: Bearer {token}
Accept: application/json
Content-Type: application/json  ← apenas em POST/PUT
```

> **Atenção:** não envie `Cache-Control`, `Pragma` ou `Expires` no frontend — esses headers podem quebrar o preflight CORS.

---

## 3. Padrão de respostas e erros

### Sucesso

| Situação | HTTP |
|---|---|
| Listagem | 200 |
| Cadastro criado | 201 |
| Atualização / ação | 200 |
| Exclusão | 200 |

### Erros

| HTTP | Significado |
|---|---|
| 401 | Token ausente ou inválido → redirecionar para login |
| 403 | Usuário sem permissão para o recurso |
| 404 | Registro não encontrado |
| 422 | Validação falhou — corpo contém os erros por campo |
| 500 | Erro interno (reportar ao backend) |

**Formato 422:**
```json
{
  "message": "The name field is required.",
  "errors": {
    "name": ["O campo nome é obrigatório."],
    "email": ["E-mail já em uso."]
  }
}
```

### Paginação

Todos os endpoints de listagem retornam paginação padrão do Laravel:

```json
{
  "data": [ ... ],
  "links": {
    "first": "http://localhost:4000/api/students?page=1",
    "last":  "http://localhost:4000/api/students?page=5",
    "prev":  null,
    "next":  "http://localhost:4000/api/students?page=2"
  },
  "meta": {
    "current_page": 1,
    "last_page": 5,
    "per_page": 20,
    "total": 98
  }
}
```

---

## 4. Dados de domínio (lookups / dropdowns)

Esses endpoints são **públicos** (não precisam de token). Carregue-os uma vez ao iniciar a app e armazene em cache no frontend.

| Endpoint | Descrição | Uso típico |
|---|---|---|
| `GET /api/domains/statuses` | Status gerais | `active` / `inactive` |
| `GET /api/domains/user-roles` | Papéis de usuário | `admin`, `teacher`, `guardian` |
| `GET /api/domains/periods` | Períodos do dia | `morning`, `afternoon`, `evening` |
| `GET /api/domains/weekdays` | Dias da semana | `monday` … `friday` |
| `GET /api/domains/guardian-relationships` | Tipo de parentesco | `father`, `mother`, `other` |
| `GET /api/domains/payment-methods` | Meios de pagamento | `pix`, `boleto`, `credit_card` |
| `GET /api/domains/enrollment-statuses` | Status de matrícula | `active`, `cancelled`, `concluded` |
| `GET /api/domains/invoice-statuses` | Status de cobrança | `pending`, `paid`, `overdue`, `cancelled` |

**Formato de resposta:**
```json
[
  { "slug": "active",   "label": "Ativo" },
  { "slug": "inactive", "label": "Inativo" }
]
```

Use o `slug` como valor nos formulários e o `label` para exibição.

---

## 5. Alunos

### Listar
```http
GET /api/students
Authorization: Bearer {token}
```

**Query params opcionais:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `status` | string | Filtrar por status (`active` / `inactive`) |
| `search` | string | Busca parcial por nome |
| `is_minor` | boolean | `true` para menores de idade |
| `page` | integer | Página (default: 1) |

---

### Criar
```http
POST /api/students
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "João da Silva",
  "birth_date": "2008-05-15",
  "document": "123.456.789-00",
  "email": "joao@email.com",
  "phone": "(11) 99999-0000",
  "is_minor": true,
  "status": "active"
}
```

| Campo | Obrigatório | Notas |
|---|---|---|
| `name` | ✅ | |
| `birth_date` | ❌ | formato `YYYY-MM-DD`, deve ser antes de hoje |
| `document` | ❌ | CPF ou RG, max 20 chars |
| `email` | ❌ | |
| `phone` | ❌ | max 20 chars |
| `is_minor` | ❌ | boolean, default `false` |
| `status` | ❌ | slug de `/api/domains/statuses`, default `active` |

---

### Exibir
```http
GET /api/students/{id}
Authorization: Bearer {token}
```

---

### Atualizar
```http
PUT /api/students/{id}
Authorization: Bearer {token}
Content-Type: application/json
```

Envie apenas os campos que deseja alterar (todos são opcionais no PUT).

---

### Excluir
```http
DELETE /api/students/{id}
Authorization: Bearer {token}
```

---

## 6. Responsáveis

### Listar
```http
GET /api/guardians?search=Maria
Authorization: Bearer {token}
```

**Query params:** `search` (nome), `page`.

---

### Criar
```http
POST /api/guardians
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Maria da Silva",
  "document": "987.654.321-00",
  "email": "maria@email.com",
  "phone": "(11) 98888-0000",
  "relationship": "mother"
}
```

| Campo | Obrigatório | Notas |
|---|---|---|
| `name` | ✅ | |
| `document` | ❌ | max 20 chars |
| `email` | ❌ | |
| `phone` | ❌ | max 20 chars |
| `relationship` | ❌ | slug de `/api/domains/guardian-relationships` |

---

### Exibir / Atualizar / Excluir
```http
GET    /api/guardians/{id}
PUT    /api/guardians/{id}
DELETE /api/guardians/{id}
```

---

## 7. Vinculação aluno ↔ responsável

### Listar responsáveis disponíveis para o aluno
```http
GET /api/students/{student_id}/guardians/available
Authorization: Bearer {token}
```

Esse endpoint retorna todos os responsáveis do tenant com o estado de vínculo atual do aluno. Use-o na tela para permitir selecionar quem será o responsável financeiro.

### Listar responsáveis de um aluno
```http
GET /api/students/{student_id}/guardians
Authorization: Bearer {token}
```

### Vincular responsável a um aluno
```http
POST /api/students/{student_id}/guardians
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{ "guardian_id": 3 }
```

O corpo acima apenas vincula um responsável existente. Para definir o financeiro, envie também `is_financial_responsible: true`.

> Observações:
> - O sistema aceita mais de um responsável financeiro por aluno.
> - Para aluno menor, é obrigatório manter pelo menos um responsável financeiro vinculado.

### Desvincular
```http
DELETE /api/students/{student_id}/guardians/{guardian_id}
Authorization: Bearer {token}
```

---

## 8. Cursos

### Listar
```http
GET /api/courses?status=active&search=Ensino
Authorization: Bearer {token}
```

### Criar
```http
POST /api/courses
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Ensino Médio",
  "description": "Curso de ensino médio regular",
  "status": "active"
}
```

| Campo | Obrigatório | Notas |
|---|---|---|
| `name` | ✅ | |
| `description` | ❌ | |
| `status` | ❌ | `active` ou `inactive` |

### Exibir / Atualizar / Excluir
```http
GET    /api/courses/{id}
PUT    /api/courses/{id}
DELETE /api/courses/{id}
```

---

## 9. Disciplinas

### Listar
```http
GET /api/subjects?status=active&search=Matemática
Authorization: Bearer {token}
```

### Criar
```http
POST /api/subjects
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Matemática",
  "description": "Álgebra, geometria e cálculo",
  "status": "active"
}
```

| Campo | Obrigatório | Notas |
|---|---|---|
| `name` | ✅ | |
| `description` | ❌ | |
| `status` | ❌ | `active` ou `inactive` |

### Exibir / Atualizar / Excluir
```http
GET    /api/subjects/{id}
PUT    /api/subjects/{id}
DELETE /api/subjects/{id}
```

---

## 10. Turmas

### Listar
```http
GET /api/school-classes?course_id=1&year=2026&period=morning&status=active
Authorization: Bearer {token}
```

**Query params:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `status` | string | slug de status |
| `course_id` | integer | Filtrar por curso |
| `year` | integer | Ano letivo |
| `period` | string | slug de `/api/domains/periods` |
| `search` | string | Busca por nome |

### Criar
```http
POST /api/school-classes
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "course_id": 1,
  "name": "3ª Série A",
  "year": 2026,
  "period": "morning",
  "capacity": 30,
  "status": "active"
}
```

| Campo | Obrigatório | Notas |
|---|---|---|
| `course_id` | ✅ | ID de um curso existente |
| `name` | ✅ | |
| `year` | ❌ | 2000–2100 |
| `period` | ❌ | slug de `/api/domains/periods` |
| `capacity` | ❌ | inteiro ≥ 1 |
| `status` | ❌ | slug de `/api/domains/statuses` |

### Exibir / Atualizar / Excluir
```http
GET    /api/school-classes/{id}
PUT    /api/school-classes/{id}
DELETE /api/school-classes/{id}
```

---

## 11. Horários de turma

### Listar horários de uma turma
```http
GET /api/school-classes/{school_class_id}/schedules
Authorization: Bearer {token}
```

### Adicionar horário a uma turma
```http
POST /api/school-classes/{school_class_id}/schedules
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "subject_id": 2,
  "weekday": "monday",
  "start_time": "08:00",
  "end_time": "09:00"
}
```

### Atualizar horário
```http
PUT /api/class-schedules/{id}
Authorization: Bearer {token}
Content-Type: application/json
```

### Excluir horário
```http
DELETE /api/class-schedules/{id}
Authorization: Bearer {token}
```

---

## 12. Matrículas

### Listar
```http
GET /api/enrollments?student_id=5&status=active&start_date=2026-01-01
Authorization: Bearer {token}
```

**Query params:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `status` | string | slug de `/api/domains/enrollment-statuses` |
| `student_id` | integer | |
| `school_class_id` | integer | |
| `start_date` | date | `YYYY-MM-DD` |
| `end_date` | date | `YYYY-MM-DD` |

### Criar
```http
POST /api/enrollments
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "student_id": 5,
  "school_class_id": 2,
  "enrollment_number": "2026001",
  "start_date": "2026-02-01",
  "end_date": "2026-12-20",
  "status": "active",
  "monthly_amount": 450.00,
  "discount_amount": 50.00,
  "payment_due_day": 10
}
```

| Campo | Obrigatório | Notas |
|---|---|---|
| `student_id` | ✅ | |
| `school_class_id` | ✅ | |
| `start_date` | ✅ | formato `YYYY-MM-DD` |
| `enrollment_number` | ❌ | max 50 chars |
| `end_date` | ❌ | deve ser ≥ `start_date` |
| `status` | ❌ | slug de `/api/domains/enrollment-statuses` |
| `monthly_amount` | ❌ | decimal ≥ 0 |
| `discount_amount` | ❌ | decimal ≥ 0 |
| `payment_due_day` | ❌ | dia do mês: 1–28 |

### Exibir / Atualizar / Excluir
```http
GET    /api/enrollments/{id}
PUT    /api/enrollments/{id}
DELETE /api/enrollments/{id}
```

---

## 13. Cobranças (Invoices)

### Listar
```http
GET /api/invoices?status=pending&student_id=5&due_date_from=2026-01-01&due_date_to=2026-12-31
Authorization: Bearer {token}
```

**Query params:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `status` | string | slug de `/api/domains/invoice-statuses` |
| `student_id` | integer | |
| `enrollment_id` | integer | |
| `due_date_from` | date | `YYYY-MM-DD` |
| `due_date_to` | date | `YYYY-MM-DD` |

### Criar
```http
POST /api/invoices
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "student_id": 5,
  "enrollment_id": 3,
  "guardian_id": 2,
  "description": "Mensalidade Maio/2026",
  "amount": 400.00,
  "due_date": "2026-05-10",
  "status": "pending",
  "payment_method": "pix",
  "notes": "Desconto de pontualidade aplicado"
}
```

| Campo | Obrigatório | Notas |
|---|---|---|
| `student_id` | ✅ | |
| `description` | ✅ | max 255 chars |
| `amount` | ✅ | decimal > 0 |
| `due_date` | ✅ | formato `YYYY-MM-DD` |
| `enrollment_id` | ❌ | |
| `guardian_id` | ❌ | responsável que receberá a cobrança |
| `status` | ❌ | slug de `/api/domains/invoice-statuses` |
| `payment_method` | ❌ | slug de `/api/domains/payment-methods` |
| `notes` | ❌ | observações livres |

### Exibir / Atualizar / Excluir
```http
GET    /api/invoices/{id}
PUT    /api/invoices/{id}
DELETE /api/invoices/{id}
```

### Marcar como pago
```http
POST /api/invoices/{id}/mark-as-paid
Authorization: Bearer {token}
```

### Cancelar cobrança
```http
POST /api/invoices/{id}/cancel
Authorization: Bearer {token}
```

---

## Fluxo completo — exemplo de cadastro de aluno com matrícula

```
1. POST /api/login                          → obtém token
2. GET  /api/domains/statuses               → carrega lookups (uma vez só)
   GET  /api/domains/enrollment-statuses
   GET  /api/domains/periods
   GET  /api/courses                        → popula select de cursos
   GET  /api/school-classes?course_id=X     → popula select de turmas

3. POST /api/students                       → cria aluno → obtém student.id
4. POST /api/guardians                      → cria responsável → obtém guardian.id
5. POST /api/students/{id}/guardians        → vincula responsável ao aluno
6. POST /api/enrollments                    → cria matrícula com student_id + school_class_id
7. POST /api/invoices                       → gera a primeira cobrança (mensalidade)
```
