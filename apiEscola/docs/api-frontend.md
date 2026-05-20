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
14. [Dashboard (painel)](#14-dashboard-painel)

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

> O `name` da disciplina deve ser único por tenant.

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

### Criar (CRUD direto)
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

### Matricular em plano (recomendado)
```http
POST /api/enrollments/subscribe
Authorization: Bearer {token}
Content-Type: application/json
```

**Body (resumo):**
```json
{
  "student_id": 5,
  "school_class_id": 2,
  "course_plan_id": 3,
  "start_date": "2026-02-01",
  "discount_amount": 0,
  "payment_due_day": 10,
  "guardian_id": 2,
  "enrollment_payment": {
    "payment_method": "pix",
    "paid_at": "2026-02-01",
    "notes": "Pago no ato"
  }
}
```

> Esse endpoint cria a matrícula e a invoice de `enrollment_fee` automaticamente.

### Matricular em pacote (recomendado)
```http
POST /api/enrollments/subscribe-bundle
Authorization: Bearer {token}
Content-Type: application/json
```

> Esse endpoint cria uma matrícula por curso do pacote e uma invoice de taxa de matrícula do pacote.

### Cobranças do contrato (análise + gerar / sincronizar)

```http
GET  /api/enrollments/{id}/contract-charges/preview
POST /api/enrollments/{id}/contract-charges/apply
```

O painel usa esses endpoints para mostrar o que já existe no sistema, o que será gerado no contrato e os boletos encontrados na Cora, com checkboxes por item. Na mesma execução é possível **gerar parcelas locais** (`generate_keys`) e **sincronizar boletos** (`sync_charge_ids`).

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

### Gerar cobrança por provedor (PIX/Boleto)
```http
POST /api/invoices/{id}/generate-charge
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "provider": "cora",
  "method": "pix",
  "environment": "stage"
}
```

| Campo | Obrigatório | Notas |
|---|---|---|
| `provider` | ✅ | atualmente: `cora` |
| `method` | ❌ | `pix`, `boleto` ou `bank_slip` |
| `environment` | ❌ | `stage`, `prod` ou `production` |

Retorna `charge_id`, `payment_url` e `pix_copy_paste` (quando método for PIX).

### Opções de pagamento por invoice (Painel)
```http
GET /api/invoices/{id}/payment-options
Authorization: Bearer {token}
```

Use este endpoint para renderizar os botões de pagamento no painel antes de chamar `generate-charge`.

Campos relevantes na resposta:
- `allowed_methods`: métodos permitidos para a invoice no momento
- `current_method`: método atual da invoice
- `actions.can_change_method`: indica se o painel pode permitir troca de método
- `method_lock.locked`: quando `true`, a invoice está travada no método original
- `method_lock.method`: método travado (`pix` ou `boleto`)
- `payment_assets`: dados para pagamento (boleto e/ou pix)

### Atualização importante: boleto + PIX no PainelEscola

Regra para implementação no painel:
1. Sempre consultar `payment-options` antes de exibir ações.
2. Se `method_lock.locked = true`, desabilitar troca de método e usar o método de `method_lock.method`.
3. Se `payment_assets` vier com dados de boleto **e** pix ao mesmo tempo, tratar como canais da mesma cobrança — **isso ocorre automaticamente** quando o método `boleto` é gerado, pois o backend solicita `BANK_SLIP + PIX` na Cora. Exibir os dois canais na mesma tela sem criar nova cobrança.
4. Chamar `generate-charge` apenas quando a troca/geração estiver permitida (`actions.can_change_method = true`).
5. Se o backend retornar `422` com `locked_reason = synced_charge_method_lock` ou `locked_reason = method_already_charged`, tratar como regra de negócio esperada (não como erro inesperado).

Regra de bloqueio de método:
- Assim que uma cobrança é gerada para uma invoice (PIX **ou** boleto), o método fica permanentemente travado.
- PIX gerado → somente PIX. Boleto gerado → somente boleto.
- O painel não deve exibir a opção de trocar de método quando `method_lock.locked = true`.

Valores possíveis de `method_lock.reason`:
| Valor | Significado |
|---|---|
| `method_already_charged` | Cobrança gerada normalmente — método não pode ser alterado |
| `synced_charge_method_lock` | Cobrança importada/sincronizada da Cora — método original preservado |

Em cobranças sincronizadas/importadas da Cora:
- boleto sincronizado permanece boleto
- pix sincronizado permanece pix
- o painel não deve gerar outro tipo de cobrança para a mesma invoice

### Consultar status da cobrança externa
```http
GET /api/invoices/{id}/charge-status
Authorization: Bearer {token}
```

Retorna `provider`, `status` e `paid_at`.

### Simular pagamento em stage (teste)
```http
POST /api/invoices/{id}/pay-charge
Authorization: Bearer {token}
Content-Type: application/json
```

**Body (opcional):**
```json
{
  "environment": "stage"
}
```

> Disponível apenas para ambiente de teste (`stage`).

### Marcar como pago (baixa manual)
```http
POST /api/invoices/{id}/mark-as-paid
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "payment_method": "cash",
  "paid_at": "2026-05-20",
  "payment_reference": "NSU 123456",
  "notes": "Pago na recepção"
}
```

| Campo | Obrigatório | Observação |
|-------|-------------|------------|
| `payment_method` | ✅ | slug de `/api/domains/payment-methods` |
| `paid_at` | ❌ | data do pagamento (padrão: agora) |
| `payment_reference` | Condicional | **Obrigatório** para `credit_card` (NSU, autorização, etc.) |
| `notes` | ❌ | observações |
| `environment` | ❌ | `stage` ou `prod` — usado ao cancelar boleto ativo na Cora antes da baixa |

**Comportamento com boleto na Cora:** se a invoice tiver cobrança ativa de boleto/híbrido (`cora_charge_id`), a API **cancela no provedor** e em seguida marca como paga com a forma informada (mesma invoice, sem clone). Cobrança só local: baixa direta. PIX ativo: baixa local; PIX expira no provedor.

**Resposta:** envelope `{ type, message, body: { invoice, cancelled_on_gateway } }`.

### Resumo financeiro
```http
GET /api/invoices/summary?paid_at_from=2026-05-01&paid_at_to=2026-05-31
Authorization: Bearer {token}
```

Retorna totais de cobranças em aberto, vencidas, baixadas no período e breakdown por `payment_method`.

### Listar cobranças (filtros adicionais)

Query params: `view=open|paid|all`, `payment_method`, `paid_at_from`, `paid_at_to`, `search` (aluno ou descrição).

### Cancelar cobrança
```http
POST /api/invoices/{id}/cancel
Authorization: Bearer {token}
```

Invalida a cobrança no provedor (boleto/híbrido com `cora_charge_id` ativo) e define `status=cancelled` no sistema. PIX ativo na Cora **não** pode ser cancelado manualmente (expira no provedor).

**Resposta de sucesso (`body`):**
```json
{
  "invoice": { "...": "InvoiceResource" },
  "cancelled_on_gateway": true,
  "environment": "stage"
}
```

### Excluir cobrança
```http
DELETE /api/invoices/{id}
Authorization: Bearer {token}
```

Só permitido quando `can_delete=true` (ex.: cobrança cancelada, pendente local sem charge ativo). Cobrança **paga** ou com charge ativo no provedor retorna `422` com `body` contendo as flags de lifecycle.

### Flags de lifecycle (em cada `InvoiceResource`)

| Campo | Descrição |
|-------|-----------|
| `can_edit` | Edição permitida |
| `can_cancel` | `POST .../cancel` permitido |
| `can_delete` | `DELETE` permitido |
| `requires_cora_cancel_before_delete` | Há charge ativo; cancelar antes de excluir |
| `cancel_block_reason` | Motivo quando `can_cancel=false` |
| `delete_block_reason` | Motivo quando `can_delete=false` |
| `lifecycle_hint` | Texto para UI (modais/tooltips) |

### Excluir matrícula
```http
DELETE /api/enrollments/{id}
```

Antes de remover, o backend cancela em lote todas as invoices pendentes no provedor (quando aplicável). Se alguma falhar (ex.: PIX ativo), retorna `422` e **não** remove a matrícula. Em sucesso, `body.invoice_cancellation` resume o lote.

### Aproveitamento do aluno (evolução por disciplina)

**Aluno autenticado:**
```http
GET /api/aluno/performance?months=6
Authorization: Bearer {token}
```

**Painel (admin/professor):**
```http
GET /api/students/{student_id}/performance?months=6&subject_id=1
Authorization: Bearer {token}
```

Retorna médias de `percentage` das tentativas concluídas, agrupadas por disciplina do simulado e evolução mês a mês (`monthly_evolution`).

**`body` inclui também `student`** (dados para montar o cabeçalho da tela): `id`, `name`, `enrollment_number`, `email`, `phone`, `document`, `birth_date`, `photo_url`, `status`, `is_minor`, `desired_courses`, `active_enrollments` (turma/curso/plano das matrículas ativas).

`student_id` permanece no topo por compatibilidade.

### Fluxo recomendado para o frontend

1. Criar matrícula por `subscribe` ou `subscribe-bundle`.
2. Ler invoices pendentes da matrícula.
3. No painel admin, gerar cobrança com `generate-charge` escolhendo PIX ou boleto.
4. Exibir no painel/mobile do aluno os dados retornados (`payment_url` e/ou `pix_copy_paste`).
5. Consultar `charge-status` para atualização de estado.
6. Em stage, usar `pay-charge` para simulação de pagamento.

---

## 14. Dashboard (painel)

Agregações por tenant via view SQL (`vw_dashboard_tenant_summary`) + consultas leves (frequência, calendário).

```http
GET /api/dashboard?school_class_id=12
Authorization: Bearer {token}
```

**Super admin:** informe `tenant_id` no `POST /login` (grava ability `tenant:{id}` no token) **ou** envie `?tenant_id=` em cada requisição. Sem tenant em contexto, a API responde `422`.

**Papéis:** `admin`, `super_admin`, `manager`, `financial`, `secretaria`, `professor`.

**Body (envelope `success`):**

| Campo | Descrição |
|-------|-----------|
| `stats` | Cards: alunos ativos, professores, turmas, cobranças em aberto (com `trend_percent` quando aplicável) |
| `students_breakdown` | Donut: ativos vs inativos |
| `finance` | Recebido no mês, em aberto, vencidas, aprovações 30d |
| `attendance` | Frequência seg–sex da semana atual (`school_class_id` opcional) |
| `school_classes` | Turmas para filtro no widget |
| `calendar` | `event_days` do mês corrente |
| `upcoming_events` | Próximos eventos (agenda) |

**Migration:** `php artisan migrate` (cria a view).

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
6. POST /api/enrollments/subscribe          → cria matrícula e invoice de enrollment_fee
  (ou POST /api/enrollments/subscribe-bundle para pacote)
7. POST /api/invoices/{invoice_id}/generate-charge
  → gera cobrança externa (PIX/boleto) para pagamento
8. GET  /api/invoices/{invoice_id}/charge-status
  → acompanha pagamento
9. (somente stage) POST /api/invoices/{invoice_id}/pay-charge
  → simula pagamento em ambiente de teste
```
