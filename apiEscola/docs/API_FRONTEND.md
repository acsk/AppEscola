# API Escola — Referência para o Frontend

**Base URL:** `http://localhost:4000/api`  
**Autenticação:** Bearer Token (Sanctum) — exceto rotas públicas marcadas com ✅

---

## Autenticação

### Login
```
POST /api/login
```
Body:
```json
{
  "login": "usuario",
  "password": "senha"
}
```
> ⚠️ O campo é `login`, não `email`.

Resposta:
```json
{
  "token": "1|abc123...",
  "user": { "id": 1, "name": "...", "role": "admin" }
}
```

### Me
```
GET /api/me
Authorization: Bearer {token}
```

### Logout
```
POST /api/logout
Authorization: Bearer {token}
```

---

## Domínios / Lookups ✅ (públicos, sem autenticação)

Use para popular dropdowns e selects.

| Endpoint | Descrição |
|---|---|
| `GET /api/domains/statuses` | Status gerais |
| `GET /api/domains/user-roles` | Perfis de usuário |
| `GET /api/domains/periods` | Períodos (manhã, tarde, noite) |
| `GET /api/domains/weekdays` | Dias da semana |
| `GET /api/domains/guardian-relationships` | Parentesco responsável/aluno |
| `GET /api/domains/payment-methods` | Métodos de pagamento |
| `GET /api/domains/enrollment-statuses` | Status de matrícula |
| `GET /api/domains/invoice-statuses` | Status de cobrança |
| `GET /api/domains/billing-cycles` | Ciclos de cobrança (mensal, semestral…) |
| `GET /api/domains/invoice-types` | Tipos de cobrança (enrollment_fee, monthly) |

Resposta padrão de domínio:
```json
[
  { "slug": "monthly", "name": "Mensal", "months": 1 }
]
```

---

## Alunos

```
GET    /api/students           → lista paginada
POST   /api/students           → criar
GET    /api/students/{id}      → detalhe
PUT    /api/students/{id}      → atualizar
DELETE /api/students/{id}      → remover
```

---

## Responsáveis

```
GET    /api/guardians          → lista
POST   /api/guardians          → criar
GET    /api/guardians/{id}     → detalhe
PUT    /api/guardians/{id}     → atualizar
DELETE /api/guardians/{id}     → remover
```

### Responsáveis de um aluno (nested)
```
GET    /api/students/{student_id}/guardians              → lista responsáveis do aluno
POST   /api/students/{student_id}/guardians              → vincular responsável ao aluno
DELETE /api/students/{student_id}/guardians/{guardian_id} → desvincular
```

Body do POST (vincular):
```json
{
  "guardian_id": 1,
  "relationship": "pai",
  "is_financial_responsible": true
}
```

---

## Cursos

```
GET    /api/courses       → lista
POST   /api/courses       → criar
GET    /api/courses/{id}  → detalhe
PUT    /api/courses/{id}  → atualizar
DELETE /api/courses/{id}  → remover
```

### Planos de curso

```
GET    /api/courses/{course_id}/plans   → planos do curso
POST   /api/courses/{course_id}/plans   → criar plano
GET    /api/course-plans/{id}           → detalhe do plano
PUT    /api/course-plans/{id}           → atualizar
DELETE /api/course-plans/{id}           → remover
```

Campos de um plano:
```json
{
  "name": "Plano Anual",
  "billing_cycle": "annual",
  "price": 1200.00,
  "monthly_equivalent": 100.00,
  "cycle_label": "Anual"
}
```

### Pacotes de cursos (bundles)

```
GET    /api/course-bundles       → lista
POST   /api/course-bundles       → criar
GET    /api/course-bundles/{id}  → detalhe
PUT    /api/course-bundles/{id}  → atualizar
DELETE /api/course-bundles/{id}  → remover
```

---

## Turmas

```
GET    /api/school-classes       → lista
POST   /api/school-classes       → criar
GET    /api/school-classes/{id}  → detalhe
PUT    /api/school-classes/{id}  → atualizar
DELETE /api/school-classes/{id}  → remover
```

A resposta já inclui `schedules` embutido:
```json
{
  "id": 1,
  "name": "Turma A",
  "course": { "id": 1, "name": "Inglês" },
  "schedules": [
    { "weekday": "monday", "start_time": "08:00", "end_time": "10:00" }
  ]
}
```

### Horários da turma (nested)
```
GET    /api/school-classes/{id}/schedules  → horários da turma
POST   /api/school-classes/{id}/schedules  → adicionar horário
PUT    /api/class-schedules/{id}           → atualizar horário
DELETE /api/class-schedules/{id}           → remover horário
```

---

## Matrículas

### Listar / Buscar
```
GET /api/enrollments
```
Filtros (query string): `status`, `student_id`, `school_class_id`, `start_date`, `end_date`

### Detalhe / Atualizar / Remover
```
GET    /api/enrollments/{id}
PUT    /api/enrollments/{id}
DELETE /api/enrollments/{id}
```

---

### Matricular em Plano de Curso

```
POST /api/enrollments/subscribe
Authorization: Bearer {token}
```

**Body:**
```json
{
  "student_id": 1,
  "school_class_id": 2,
  "course_plan_id": 3,
  "start_date": "2026-05-01",
  "end_date": "2027-04-30",        // opcional — calculado automaticamente pelo ciclo do plano
  "discount_amount": 0,            // opcional
  "payment_due_day": 10,           // opcional, padrão 10
  "guardian_id": 1,                // opcional — detectado automaticamente pelo flag is_financial_responsible

  "enrollment_payment": {          // opcional — omitir deixa taxa de matrícula como pendente
    "payment_method": "pix",       // obrigatório dentro do objeto se for informar
    "paid_at": "2026-05-01",       // opcional, preenche com hoje se omitido
    "notes": "Pago na recepção"    // opcional
  }
}
```

**Resposta 201:**
```json
{
  "id": 10,
  "student_id": 1,
  "school_class_id": 2,
  "course_plan_id": 3,
  "enrollment_number": "A1B2C3D4",
  "start_date": "2026-05-01",
  "end_date": "2027-04-30",
  "status": "active",
  "monthly_amount": 150.00,
  "discount_amount": 0,
  "payment_due_day": 10,
  "financial_guardian_id": 1,
  "invoices": [
    {
      "id": 1,
      "type": "enrollment_fee",
      "description": "Taxa de Matrícula — Inglês",
      "amount": 150.00,
      "due_date": "2026-05-01",
      "status": "pending"
    },
    {
      "id": 2,
      "type": "monthly",
      "description": "Mensalidade 05/2026 — Inglês",
      "amount": 150.00,
      "due_date": "2026-05-10",
      "status": "pending"
    },
    {
      "id": 3,
      "type": "monthly",
      "description": "Mensalidade 06/2026 — Inglês",
      "amount": 150.00,
      "due_date": "2026-06-10",
      "status": "pending"
    }
    // ... uma por mês até o end_date
  ]
}
```

> **Como o `end_date` é calculado automaticamente:**
> - Plano mensal (monthly): `start_date + 1 mês - 1 dia`
> - Plano semestral (semiannual): `start_date + 6 meses - 1 dia`
> - Plano anual (annual): `start_date + 12 meses - 1 dia`
> - etc. conforme o `billing_cycle` do plano

---

### Matricular em Pacote de Cursos

```
POST /api/enrollments/subscribe-bundle
Authorization: Bearer {token}
```

**Body:**
```json
{
  "student_id": 1,
  "bundle_id": 2,
  "school_class_ids": [10, 11, 12],  // um ID de turma por curso do pacote
  "start_date": "2026-05-01",
  "end_date": "2027-04-30",           // opcional — calculado automaticamente
  "discount_amount": 0,               // opcional
  "payment_due_day": 10,              // opcional, padrão 10
  "guardian_id": 1,                   // opcional

  "enrollment_payment": {             // opcional
    "payment_method": "bank_slip",
    "paid_at": "2026-05-01",
    "notes": ""
  }
}
```

**Resposta 201:**
```json
{
  "enrollments": [
    { "id": 11, "school_class_id": 10, ... },
    { "id": 12, "school_class_id": 11, ... },
    { "id": 13, "school_class_id": 12, ... }
  ],
  "bundle": {
    "id": 2,
    "name": "Pacote Full",
    "billing_cycle": "annual",
    "cycle_label": "Anual",
    "price": 3000.00,
    "monthly_equivalent": 250.00
  },
  "enrollment_fee": {
    "id": 20,
    "type": "enrollment_fee",
    "description": "Taxa de Matrícula — Pacote Full",
    "amount": 250.00,
    "due_date": "2026-05-01",
    "status": "pending"
  },
  "monthly_invoices": [
    {
      "id": 21,
      "type": "monthly",
      "description": "Mensalidade 05/2026 — Pacote Full",
      "amount": 250.00,
      "due_date": "2026-05-10",
      "status": "pending"
    }
    // ... uma por mês até o end_date
  ],
  "financial_guardian_id": 1
}
```

> O pacote gera **uma única série de mensalidades** (não por curso), linkadas à primeira matrícula.

---

## Cobranças (Invoices)

### Listar
```
GET /api/invoices
```
Filtros: `status`, `student_id`, `enrollment_id`, `due_date_from`, `due_date_to`

### Detalhe
```
GET /api/invoices/{id}
```

### Atualizar (campos gerais)
```
PUT /api/invoices/{id}
```
Body (todos opcionais):
```json
{
  "status": "paid",
  "paid_at": "2026-05-10",    // opcional se status=paid, auto-preenche com hoje
  "payment_method": "pix",
  "amount": 150.00,
  "due_date": "2026-05-10",
  "notes": "Observação"
}
```
> Cobranças com status `paid` ou `cancelled` **não podem ser editadas**.

### Marcar como paga (atalho)
```
POST /api/invoices/{id}/mark-as-paid
```
Body:
```json
{
  "payment_method": "pix",
  "paid_at": "2026-05-10",    // opcional
  "notes": ""                 // opcional
}
```

### Cancelar
```
POST /api/invoices/{id}/cancel
```

### Remover
```
DELETE /api/invoices/{id}
```

---

## Campos de Invoice (resposta)

```json
{
  "id": 1,
  "enrollment_id": 10,
  "student_id": 1,
  "guardian_id": 1,
  "type": "monthly",              // enrollment_fee | monthly
  "description": "Mensalidade 05/2026 — Inglês",
  "amount": 150.00,
  "due_date": "2026-05-10",
  "status": "pending",            // pending | paid | overdue | cancelled
  "payment_method": "pix",        // null se não pago
  "paid_at": "2026-05-10T10:00:00.000000Z",  // null se não pago
  "notes": null,
  "created_at": "2026-04-29T...",
  "updated_at": "2026-04-29T..."
}
```

---

## Métodos de pagamento válidos

| slug | Nome |
|---|---|
| `cash` | Dinheiro |
| `pix` | Pix |
| `credit_card` | Cartão de crédito |
| `debit_card` | Cartão de débito |
| `bank_slip` | Boleto |
| `transfer` | Transferência |

> Consulte sempre via `GET /api/domains/payment-methods` para a lista atualizada.

---

## Regras importantes

| Regra | Detalhe |
|---|---|
| Um aluno não pode ser matriculado duas vezes na mesma turma | Retorna 422 com mensagem de erro |
| `end_date` é calculado automaticamente | Baseado no `billing_cycle` do plano/pacote, se não informado |
| Taxa de matrícula gerada automaticamente | Sempre criada ao matricular; pode ser paga no ato via `enrollment_payment` |
| Mensalidades geradas automaticamente | Uma por mês do período, com vencimento no `payment_due_day` |
| Invoice paga/cancelada não pode ser editada | PUT retorna 422 |
| `paid_at` auto-preenchido | Se `status=paid` for enviado sem `paid_at`, usa a data/hora atual |
