# Fluxo de Matrícula com Criação Automática de Invoice

> Atualizado em 28/04/2026

---

## Visão Geral

Ao realizar uma matrícula (plano ou pacote), o sistema **cria automaticamente uma invoice** de `enrollment_fee` (Taxa de Matrícula). O frontend pode informar o pagamento no próprio ato da matrícula via o campo `enrollment_payment`, ou deixar a cobrança como **pendente** para ser paga depois.

---

## Novos Endpoints de Domínio

Estes endpoints são **públicos** (sem autenticação) e retornam as opções disponíveis para preencher selects no frontend.

### `GET /api/domains/billing-cycles`
Ciclos de cobrança disponíveis para planos e pacotes.

**Resposta:**
```json
[
  { "slug": "monthly",       "name": "Mensal",        "months": 1  },
  { "slug": "bimonthly",     "name": "Bimestral",     "months": 2  },
  { "slug": "quadrimestral", "name": "Quadrimestral", "months": 4  },
  { "slug": "semiannual",    "name": "Semestral",     "months": 6  },
  { "slug": "annual",        "name": "Anual",         "months": 12 }
]
```

---

### `GET /api/domains/invoice-types`
Tipos de cobrança disponíveis.

**Resposta:**
```json
[
  { "slug": "enrollment_fee", "name": "Taxa de Matrícula" },
  { "slug": "monthly",        "name": "Mensalidade"       },
  { "slug": "other",          "name": "Outro"             }
]
```

---

## Endpoint: Matricular em Plano

### `POST /api/enrollments/subscribe`
> Requer autenticação Bearer Token

**Body:**
```json
{
  "student_id":      1,
  "school_class_id": 2,
  "course_plan_id":  3,
  "start_date":      "2026-05-01",
  "end_date":        null,
  "discount_amount": 0,
  "payment_due_day": 10,
  "guardian_id":     null,

  "enrollment_payment": {
    "payment_method": "pix",
    "paid_at":        "2026-05-01",
    "notes":          "Pago na recepção"
  }
}
```

### Campo `enrollment_payment` (opcional)

| Campo            | Tipo   | Obrigatório | Descrição                                         |
|------------------|--------|-------------|---------------------------------------------------|
| `payment_method` | string | Não         | Slug de `domain_payment_methods`. Se informado, a invoice é criada como **paga**. Se omitido, fica **pendente**. |
| `paid_at`        | date   | Não         | Data do pagamento. Se omitido com `payment_method`, usa a data atual. |
| `notes`          | string | Não         | Observação livre (max 500 chars)                  |

**Valores válidos para `payment_method`:**
`cash` · `pix` · `credit_card` · `debit_card` · `bank_slip` · `transfer`

---

**Resposta (201):**
```json
{
  "id": 10,
  "enrollment_number": "A1B2C3D4",
  "status": "active",
  "start_date": "2026-05-01",
  "monthly_amount": "150.00",
  "discount_amount": "0.00",
  "student": { "id": 1, "name": "João Silva" },
  "school_class": {
    "id": 2,
    "name": "Turma A",
    "course": { "id": 1, "name": "Violão" }
  },
  "course_plan": {
    "id": 3,
    "billing_cycle": "monthly",
    "cycle_label": "Mensal",
    "months_in_cycle": 1,
    "price": "150.00",
    "monthly_equivalent": "150.00"
  },
  "invoices": [
    {
      "id": 5,
      "type": "enrollment_fee",
      "description": "Taxa de Matrícula — Violão",
      "amount": "150.00",
      "due_date": "2026-05-01",
      "status": "paid",
      "paid_at": "2026-05-01",
      "payment_method": "pix",
      "notes": "Pago na recepção"
    }
  ],
  "financial_guardian_id": 2
}
```

> Se `enrollment_payment` for **omitido**, o invoice terá `"status": "pending"` e `"paid_at": null`.

> O campo `financial_guardian_id` identifica o responsável financeiro principal usado na matrícula e nas cobranças. O aluno pode ter mais de um responsável marcado como financeiro, mas o fluxo de matrícula resolve um responsável principal para a invoice.

---

## Endpoint: Matricular em Pacote

### `POST /api/enrollments/subscribe-bundle`
> Requer autenticação Bearer Token

O pacote gera **uma matrícula por curso** + **uma única invoice** de taxa de matrícula cobrindo o pacote inteiro.

**Body:**
```json
{
  "student_id":       1,
  "bundle_id":        1,
  "school_class_ids": [10, 11, 12],
  "start_date":       "2026-05-01",
  "end_date":         null,
  "discount_amount":  50,
  "payment_due_day":  10,
  "guardian_id":      null,

  "enrollment_payment": {
    "payment_method": "cash",
    "paid_at":        "2026-05-01",
    "notes":          "Desconto de R$50 concedido"
  }
}
```

> `school_class_ids` deve conter um ID de turma para cada curso do pacote.

---

**Resposta (201):**
```json
{
  "enrollments": [
    {
      "id": 11,
      "enrollment_number": "E1F2G3H4",
      "status": "active",
      "monthly_amount": "100.00",
      "school_class": { "id": 10, "course": { "name": "Violão" } }
    },
    {
      "id": 12,
      "enrollment_number": "I5J6K7L8",
      "status": "active",
      "monthly_amount": "100.00",
      "school_class": { "id": 11, "course": { "name": "Piano" } }
    }
  ],
  "bundle": {
    "id": 1,
    "name": "Pacote Cordas + Teclas",
    "billing_cycle": "monthly",
    "cycle_label": "Mensal",
    "price": "200.00",
    "monthly_equivalent": "200.00"
  },
  "enrollment_fee": {
    "id": 6,
    "type": "enrollment_fee",
    "description": "Taxa de Matrícula — Pacote Cordas + Teclas",
    "amount": "150.00",
    "due_date": "2026-05-01",
    "status": "paid",
    "paid_at": "2026-05-01",
    "payment_method": "cash",
    "notes": "Desconto de R$50 concedido"
  },
  "financial_guardian_id": 2
}
```

> A `amount` da invoice = `monthly_equivalent` do pacote − `discount_amount` (mínimo R$ 0,00).

> Assim como no fluxo de plano, o sistema permite mais de um responsável financeiro no aluno, mas a matrícula resolve um `financial_guardian_id` principal para emissão da taxa.

---

## Lógica de Cálculo do Valor da Invoice

| Cenário | Fórmula |
|---|---|
| Plano | `plan.monthly_equivalent() - discount_amount` |
| Pacote | `bundle.monthly_equivalent() - discount_amount` |

O `monthly_equivalent` é sempre o **preço dividido pelos meses do ciclo**:
- Plano anual de R$ 1.200 → `monthly_equivalent = 100,00`
- Pacote semestral de R$ 600 → `monthly_equivalent = 100,00`

---

## Campo `type` nas Invoices

O campo `type` foi adicionado às invoices para distinguir o tipo de cobrança:

| `type`           | Descrição                            |
|------------------|--------------------------------------|
| `enrollment_fee` | Taxa de Matrícula (criada automaticamente no ato da matrícula) |
| `monthly`        | Mensalidade recorrente                |
| `other`          | Outro (cobrança avulsa)              |

---

## Resumo do Fluxo Frontend (Formulário de Matrícula)

```
1. Buscar planos/pacotes disponíveis
   GET /api/course-plans  ou  GET /api/course-bundles

2. Buscar responsáveis disponíveis do aluno para seleção do financeiro
  GET /api/students/{student_id}/guardians/available

3. (Opcional) Buscar ciclos de cobrança para exibição
   GET /api/domains/billing-cycles

4. Montar o formulário com campos:
   - Aluno, Turma(s), Plano/Pacote, Data de início
  - Lista de responsáveis do aluno com marcação de `is_financial_responsible`
   - Desconto (opcional)
   - Seção "Pagar taxa de matrícula agora?" (toggle)
     └─ Se sim: mostrar select de método de pagamento, campo de data e observação

5. Enviar POST para /api/enrollments/subscribe (plano)
               ou  /api/enrollments/subscribe-bundle (pacote)

6. Na resposta, exibir:
   - Número(s) da matrícula
   - Invoice da taxa de matrícula com status (paga/pendente)
  - Dados do responsável financeiro principal detectado
```

---

## Endpoints de Domínio Completos

| Endpoint | Descrição |
|---|---|
| `GET /api/domains/statuses` | Status genéricos |
| `GET /api/domains/periods` | Períodos de aula |
| `GET /api/domains/weekdays` | Dias da semana |
| `GET /api/domains/guardian-relationships` | Tipos de relação responsável-aluno |
| `GET /api/domains/payment-methods` | Métodos de pagamento |
| `GET /api/domains/enrollment-statuses` | Status de matrícula |
| `GET /api/domains/invoice-statuses` | Status de cobrança |
| `GET /api/domains/billing-cycles` | ✨ Ciclos de cobrança (NOVO) |
| `GET /api/domains/invoice-types` | ✨ Tipos de invoice (NOVO) |
| `GET /api/students/{student_id}/guardians/available` | Responsáveis do aluno para seleção do financeiro |
