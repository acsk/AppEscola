# API AppEscola — Documentação para Frontend

> **Base URL:** `http://localhost:4000/api`  
> **Formato:** JSON (`Content-Type: application/json` em todas as requisições)  
> **Autenticação:** Bearer Token via header `Authorization: Bearer {token}`

---

## Índice

1. [Convenções Gerais](#1-convenções-gerais)
2. [Autenticação](#2-autenticação)
3. [Domínios / Lookups](#3-domínios--lookups)
4. [Alunos](#4-alunos)
5. [Responsáveis (Guardiões)](#5-responsáveis-guardiões)
6. [Cursos](#6-cursos)
7. [Planos de Curso](#7-planos-de-curso)
8. [Pacotes de Cursos (Bundles)](#8-pacotes-de-cursos-bundles)
9. [Turmas](#9-turmas)
10. [Horários de Turma](#10-horários-de-turma)
11. [Matrículas](#11-matrículas)
12. [Cobranças (Invoices)](#12-cobranças-invoices)
13. [Fluxos Especiais](#13-fluxos-especiais)

---

## 1. Convenções Gerais

### Paginação

Todas as listagens retornam paginação no padrão Laravel:

```json
{
  "data": [ ...itens... ],
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

### Respostas de Erro

| Status | Situação |
|--------|----------|
| `401`  | Não autenticado (token ausente ou expirado) |
| `403`  | Sem permissão para o recurso |
| `404`  | Recurso não encontrado |
| `422`  | Dados inválidos — body contém `{ "message": "...", "errors": { "campo": ["mensagem"] } }` |

---

## 2. Autenticação

### `POST /login` — Login

Aceita **e-mail** (admin, secretaria, professor) ou **número de matrícula** (aluno).

**Request:**
```json
{
  "login": "202600001",
  "password": "15052008"
}
```

> Para admin/staff: `"login": "admin@escola.com"`  
> Para aluno: `"login": "202600001"` (número de matrícula)

**Response `200`:**
```json
{
  "token": "1|abc123...",
  "password_change_required": true,
  "user": {
    "id": 42,
    "name": "João da Silva",
    "email": "202600001@interno",
    "role": "aluno",
    "status": "active",
    "password_change_required": true
  }
}
```

> **⚠️ Importante:** se `password_change_required === true`, redirecione o aluno para a tela de troca de senha antes de permitir o acesso.

**Senha inicial do aluno:** `ddmmYYYY` da data de nascimento. Ex.: nascido em 15/05/2008 → senha `15052008`.  
Se não houver data de nascimento: `Aluno@{id com 4 dígitos}`, ex.: `Aluno@0042`.

---

### `GET /me` — Usuário autenticado *(requer token)*

Retorna os dados do usuário logado.

```json
{
  "id": 42,
  "name": "João da Silva",
  "role": "aluno",
  "status": "active",
  "password_change_required": false
}
```

---

### `POST /logout` — Logout *(requer token)*

Invalida o token atual.

```json
{ "message": "Logout realizado com sucesso." }
```

---

## 3. Domínios / Lookups

Rotas **públicas** (sem token). Use para popular dropdowns e selects.

| Endpoint | Descrição |
|----------|-----------|
| `GET /domains/statuses` | Status gerais (`active`, `inactive`) |
| `GET /domains/user-roles` | Papéis de usuário (`admin`, `secretary`, `teacher`, `aluno`) |
| `GET /domains/periods` | Períodos do dia (`morning`, `afternoon`, `evening`) |
| `GET /domains/weekdays` | Dias da semana (`monday` … `saturday`) |
| `GET /domains/guardian-relationships` | Tipos de relação com responsável |
| `GET /domains/payment-methods` | Métodos de pagamento |
| `GET /domains/enrollment-statuses` | Status de matrícula |
| `GET /domains/invoice-statuses` | Status de cobrança |

**Exemplo de response:**
```json
[
  { "slug": "monthly",       "label": "Mensal" },
  { "slug": "bimonthly",     "label": "Bimestral" },
  { "slug": "quadrimestral", "label": "Quadrimestral" },
  { "slug": "semiannual",    "label": "Semestral" },
  { "slug": "annual",        "label": "Anual" }
]
```

**Relacionamentos disponíveis** (`/domains/guardian-relationships`):

| slug | Label |
|------|-------|
| `pai` | Pai |
| `mae` | Mãe |
| `avo_paterno` | Avô Paterno |
| `avo_materno` | Avó Materno |
| `tio` | Tio/Tia |
| `responsavel_legal` | Responsável Legal |
| `outro` | Outro |

---

## 4. Alunos

*Todas as rotas requerem token.*

### `GET /students` — Listar

**Query params opcionais:**

| Param | Tipo | Exemplo |
|-------|------|---------|
| `status` | string | `active` |
| `search` | string | `João` (busca por nome) |
| `is_minor` | boolean | `true` |

**Objeto Aluno:**
```json
{
  "id": 1,
  "tenant_id": 1,
  "user_id": 42,
  "enrollment_number": "202600001",
  "name": "João da Silva",
  "birth_date": "2008-05-15",
  "document": "123.456.789-00",
  "email": "joao@email.com",
  "phone": "(11) 91234-5678",
  "is_minor": true,
  "status": "active",
  "guardians": [ ...ver seção 5... ],
  "created_at": "2026-04-28T00:00:00.000000Z",
  "updated_at": "2026-04-28T00:00:00.000000Z"
}
```

---

### `POST /students` — Criar aluno

**Body:**
```json
{
  "name": "João da Silva",
  "birth_date": "2008-05-15",
  "document": "123.456.789-00",
  "email": "joao@email.com",
  "phone": "(11) 91234-5678",
  "is_minor": true,
  "status": "active",
  "guardians": [
    {
      "name": "Maria da Silva",
      "document": "987.654.321-00",
      "email": "maria@email.com",
      "phone": "(11) 98765-4321",
      "relationship": "mae",
      "is_financial_responsible": true,
      "is_pedagogical_responsible": true,
      "can_access_portal": true
    }
  ]
}
```

> Para vincular um responsável **já cadastrado**, use `guardian_id` no lugar dos dados:
> ```json
> { "guardian_id": 5, "relationship": "pai", "is_financial_responsible": false }
> ```

**Regras de validação:**
- `document` e `email` são únicos **por escola** (tenant)
- Máximo de **1** responsável com `is_financial_responsible: true`
- `enrollment_number` é gerado automaticamente (não enviar)

**Response `201`:** objeto Aluno com `guardians` incluídos e `enrollment_number` preenchido.

---

### `GET /students/{id}` — Exibir

Retorna o objeto Aluno com `guardians` carregados.

---

### `PUT /students/{id}` — Atualizar

Mesma estrutura do `POST`. Campos não enviados não são alterados.

---

### `DELETE /students/{id}` — Remover (soft delete)

```json
{ "message": "Aluno removido com sucesso." }
```

---

## 5. Responsáveis (Guardiões)

### `GET /students/{student_id}/guardians` — Listar responsáveis do aluno

Retorna array de responsáveis com o `pivot` de permissões.

**Objeto Responsável:**
```json
{
  "id": 3,
  "name": "Maria da Silva",
  "document": "987.654.321-00",
  "email": "maria@email.com",
  "phone": "(11) 98765-4321",
  "relationship": "mae",
  "pivot": {
    "is_financial_responsible": true,
    "is_pedagogical_responsible": true,
    "can_access_portal": true
  }
}
```

---

### `POST /students/{student_id}/guardians` — Adicionar responsável ao aluno

```json
{
  "guardian_id": 5,
  "relationship": "pai",
  "is_financial_responsible": false,
  "is_pedagogical_responsible": false,
  "can_access_portal": true
}
```

---

### `DELETE /students/{student_id}/guardians/{guardian_id}` — Desvincular responsável

Remove apenas o vínculo (não exclui o cadastro do responsável).

---

### `GET /guardians` / `POST /guardians` / `PUT /guardians/{id}` / `DELETE /guardians/{id}`

CRUD completo de responsáveis (independente de aluno).

---

## 6. Cursos

### `GET /courses` — Listar  
### `POST /courses` — Criar  
### `GET /courses/{id}` — Exibir  
### `PUT /courses/{id}` — Atualizar  
### `DELETE /courses/{id}` — Remover

**Objeto Curso:**
```json
{
  "id": 1,
  "tenant_id": 1,
  "name": "Curso de Programação",
  "description": "Lógica e algoritmos",
  "status": "active"
}
```

---

## 7. Planos de Curso

Planos definem o **preço e ciclo de cobrança** de um curso.

### `GET /courses/{course_id}/plans` — Listar planos do curso
### `POST /courses/{course_id}/plans` — Criar plano

**Body:**
```json
{
  "name": "Mensal Básico",
  "billing_cycle": "monthly",
  "price": 200.00,
  "status": "active"
}
```

**Ciclos disponíveis:** `monthly` · `bimonthly` · `quadrimestral` · `semiannual` · `annual`

### `GET /course-plans/{id}` — Exibir
### `PUT /course-plans/{id}` — Atualizar
### `DELETE /course-plans/{id}` — Remover

**Objeto CoursePlan:**
```json
{
  "id": 1,
  "course_id": 1,
  "course": { "id": 1, "name": "Curso de Programação" },
  "name": "Semestral",
  "billing_cycle": "semiannual",
  "cycle_label": "Semestral",
  "months_in_cycle": 6,
  "price": "900.00",
  "monthly_equivalent": 150.00,
  "status": "active"
}
```

> `monthly_equivalent` = `price ÷ months_in_cycle` — use para exibir o valor mensal equivalente.

---

## 8. Pacotes de Cursos (Bundles)

Um bundle agrupa ≥2 cursos com desconto e ciclo próprio de cobrança.

### `GET /course-bundles` — Listar
### `POST /course-bundles` — Criar

**Body:**
```json
{
  "name": "CPM Completo",
  "description": "Pacote com todos os módulos",
  "billing_cycle": "monthly",
  "price": 350.00,
  "status": "active",
  "course_ids": [1, 2, 3]
}
```

> `course_ids` — obrigatório, mínimo 2 cursos.

### `GET /course-bundles/{id}` — Exibir
### `PUT /course-bundles/{id}` — Atualizar
### `DELETE /course-bundles/{id}` — Remover

**Objeto Bundle:**
```json
{
  "id": 1,
  "name": "CPM Completo",
  "description": "Pacote com todos os módulos",
  "billing_cycle": "semiannual",
  "cycle_label": "Semestral",
  "months_in_cycle": 6,
  "price": "900.00",
  "monthly_equivalent": 150.00,
  "status": "active",
  "courses": [
    { "id": 1, "name": "Programação" },
    { "id": 2, "name": "Design" }
  ]
}
```

---

## 9. Turmas

### `GET /school-classes` — Listar
### `POST /school-classes` — Criar
### `GET /school-classes/{id}` — Exibir
### `PUT /school-classes/{id}` — Atualizar
### `DELETE /school-classes/{id}` — Remover

**Body:**
```json
{
  "name": "Turma A - 2026",
  "course_id": 1,
  "period": "morning",
  "status": "active"
}
```

---

## 10. Horários de Turma

### `GET /school-classes/{class_id}/schedules` — Listar horários
### `POST /school-classes/{class_id}/schedules` — Criar horário

**Body:**
```json
{
  "weekday": "monday",
  "start_time": "08:00",
  "end_time": "10:00",
  "subject_id": 1
}
```

### `PUT /class-schedules/{id}` — Atualizar
### `DELETE /class-schedules/{id}` — Remover

---

## 11. Matrículas

### `GET /enrollments` — Listar

**Query params opcionais:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `status` | string | `active`, `cancelled`, etc. |
| `student_id` | integer | Filtrar por aluno |
| `school_class_id` | integer | Filtrar por turma |
| `start_date` | date | Matrículas a partir de |
| `end_date` | date | Matrículas até |

**Objeto Enrollment:**
```json
{
  "id": 10,
  "tenant_id": 1,
  "student_id": 1,
  "student": { ...objeto aluno... },
  "school_class_id": 2,
  "school_class": { "id": 2, "name": "Turma A" },
  "course_plan_id": 3,
  "course_plan": { ...objeto plan... },
  "bundle_id": null,
  "bundle": null,
  "enrollment_number": "ABC12DEF",
  "start_date": "2026-02-01",
  "end_date": null,
  "status": "active",
  "monthly_amount": "200.00",
  "discount_amount": "0.00",
  "payment_due_day": 10
}
```

---

### `POST /enrollments/subscribe` — Matricular em plano *(fluxo principal)*

**Body:**
```json
{
  "student_id": 1,
  "school_class_id": 2,
  "course_plan_id": 3,
  "start_date": "2026-02-01",
  "end_date": null,
  "discount_amount": 0,
  "payment_due_day": 10,
  "guardian_id": null
}
```

> `guardian_id` é opcional — o sistema detecta automaticamente o responsável marcado como `is_financial_responsible` do aluno.

**Response `201`:** objeto Enrollment + `financial_guardian_id`.

---

### `POST /enrollments/subscribe-bundle` — Matricular em pacote *(bundle)*

Cria **uma matrícula por turma informada**, todas vinculadas ao mesmo bundle.

**Body:**
```json
{
  "student_id": 1,
  "bundle_id": 1,
  "school_class_ids": [2, 4, 6],
  "start_date": "2026-02-01",
  "end_date": null,
  "discount_amount": 0,
  "payment_due_day": 10,
  "guardian_id": null
}
```

> Informe um `school_class_id` **por curso** do pacote. A ordem não importa, desde que cada turma corresponda a um dos cursos do bundle.

**Response `201`:**
```json
{
  "enrollments": [
    { ...objeto enrollment curso 1... },
    { ...objeto enrollment curso 2... }
  ],
  "bundle": {
    "id": 1,
    "name": "CPM Completo",
    "price": "900.00",
    "monthly_equivalent": 150.00,
    "billing_cycle": "semiannual"
  },
  "financial_guardian_id": 3
}
```

> `monthly_amount` de cada enrollment = `bundle.monthly_equivalent ÷ quantidade_de_cursos`.

---

### `GET /enrollments/{id}` — Exibir
### `PUT /enrollments/{id}` — Atualizar
### `DELETE /enrollments/{id}` — Remover

---

## 12. Cobranças (Invoices)

### `GET /invoices` — Listar

**Objeto Invoice:**
```json
{
  "id": 20,
  "enrollment_id": 10,
  "student_id": 1,
  "student": { ...objeto aluno... },
  "guardian_id": 3,
  "guardian": { ...objeto responsável... },
  "description": "Mensalidade Março/2026",
  "amount": "200.00",
  "due_date": "2026-03-10",
  "paid_at": null,
  "status": "pending",
  "payment_method": null,
  "notes": null
}
```

---

### `POST /invoices/mark-as-paid/{id}` — Marcar como pago

**Body:**
```json
{
  "payment_method": "pix",
  "paid_at": "2026-03-10",
  "notes": "Pago via app"
}
```

---

### `POST /invoices/cancel/{id}` — Cancelar cobrança

---

## 13. Fluxos Especiais

### Fluxo de Primeiro Login do Aluno

```
1. POST /login  com enrollment_number + senha inicial
2. Verificar response.password_change_required
3. Se true → redirecionar para tela "Crie sua nova senha"
4. Chamar endpoint de troca de senha com a nova senha
5. Após troca → liberar acesso ao portal
```

### Fluxo de Cadastro de Aluno com Responsável

```
1. GET /domains/guardian-relationships  → popular select de tipo de relação
2. POST /students  com o array guardians[]
3. Response 201 já retorna o aluno com os responsáveis vinculados
4. enrollment_number gerado automaticamente (exibir para o aluno/família)
```

### Fluxo de Matrícula por Pacote

```
1. GET /course-bundles  → listar pacotes disponíveis (mostrar price + cycle_label)
2. Usuário seleciona um bundle
3. GET /course-bundles/{id}  → listar courses[] do bundle
4. Para cada curso: buscar turma disponível via GET /school-classes?course_id=X
5. POST /enrollments/subscribe-bundle  com os school_class_ids
6. Response retorna uma matrícula por curso + resumo financeiro do bundle
```

### Ciclos de Cobrança

| Valor | Label | Meses |
|-------|-------|-------|
| `monthly` | Mensal | 1 |
| `bimonthly` | Bimestral | 2 |
| `quadrimestral` | Quadrimestral | 4 |
| `semiannual` | Semestral | 6 |
| `annual` | Anual | 12 |

> O campo `monthly_equivalent` já vem calculado em todos os planos e bundles. Use-o para exibir o valor mensal equivalente sem precisar calcular no front.
