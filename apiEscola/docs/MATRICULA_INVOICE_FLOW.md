# Fluxo de Matrícula com Criação Automática de Invoice

> Atualizado em 17/05/2026

---

## Visão Geral

Ao realizar uma matrícula (plano ou pacote), o sistema **cria automaticamente uma invoice** de `enrollment_fee` (Taxa de Matrícula). O valor da taxa vem do curso cadastrado e é importado para a matrícula. O frontend pode informar o pagamento no próprio ato da matrícula via o campo `enrollment_payment`, ou deixar a cobrança como **pendente** para ser paga depois.

> No cadastro do plano, preencha `enrollment_fee_amount`. Esse valor é levado para a invoice da matrícula quando o aluno se inscreve no plano.

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
  "charges_generated_at": null,
  "charges_batch_generated": false,
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

> O valor da taxa de matrícula vem de `course_plan.enrollment_fee_amount`. Se o plano não tiver esse campo preenchido, o backend usa o equivalente mensal do plano como fallback.

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

Na matrícula, o valor líquido das mensalidades usa `monthly_amount` (base) − `discount_amount`, exposto na API como `net_monthly_amount`.

### Recalcular cobranças pendentes (produção)

Se o desconto foi ajustado depois que as invoices foram geradas:

```bash
# Diagnóstico (lista cobranças e alerta se monthly_amount ≠ plano)
php artisan enrollments:sync-invoice-amounts MAT-2-00003 --dry-run

# Corrigir base gravada errada (ex.: 125 quando o plano é 120) e sincronizar pendentes
php artisan enrollments:sync-invoice-amounts MAT-2-00003 --fix-base-from-plan

# Só simular a correção da base
php artisan enrollments:sync-invoice-amounts MAT-2-00003 --fix-base-from-plan --dry-run
```

Aceita ID numérico ou `enrollment_number`. Atualiza apenas invoices `pending` e `overdue` dos tipos `monthly` e `enrollment_fee`. Cobranças já pagas ou canceladas não são alteradas.

### Cobranças do contrato (preview / Cora)

Na modal **Cobranças do contrato**, ao consultar a Cora:

- Boletos **novos** no provedor (`link_status: new`) vêm **marcados** para sincronizar/importar.
- `provider_boleto_list`: boletos **desta matrícula** ou **mesmo CPF** (sincronizáveis); linhas iguais podem vir agrupadas (`group_count`).
- `provider_boleto_school_groups`: resumo dos demais boletos da escola (vencimento + valor + quantidade), para não repetir dezenas de linhas de outros alunos.

### Debug em produção

`GET /api/enrollments/{id}/contract-charges/preview?debug=1&environment=prod`

Autorizado se:

- usuário **super_admin**, ou
- `.env` com `CORA_CONTRACT_CHARGES_DEBUG=true` (qualquer usuário autenticado do tenant).

A resposta inclui `body.debug` com:

- `local`: valores da matrícula, parcelas planejadas, CPFs mascarados do pagador
- `cora.api`: contagem da listagem Cora e se o CPF veio no payload da listagem
- `cora.boleto_diagnosis`: até 30 boletos com `link_reason` (`no_customer_document_in_list`, `cpf_not_matching_payer`, etc.)
- `cora.hydrate_samples`: compara listagem vs GET por ID (quando CPF não vem na listagem)

No painel: botão **Debug** no modal “Cobranças do contrato” (admin/financeiro/super_admin).

Log adicional: `storage/logs/cora_sync_debug.log` (mesmo canal das sincronizações Cora).

### Artisan (SSH em produção)

```bash
php artisan enrollments:debug-contract-charges 5
php artisan enrollments:debug-contract-charges MAT-2-00003 --environment=prod
php artisan enrollments:debug-contract-charges 5 --json
php artisan enrollments:debug-contract-charges 5 --save=relatorio.json
```

Opções:

| Opção | Descrição |
|--------|-----------|
| `--environment=prod` | Ambiente Cora (padrão: prod) |
| `--invoice-types=monthly` | Tipos do contrato (vírgula) |
| `--json` | Saída só JSON no terminal |
| `--save=` | Grava em `storage/logs/` (nome automático se só passar `relatorio.json`) |

Não exige `CORA_CONTRACT_CHARGES_DEBUG` — roda com credenciais Cora do tenant no servidor.
- Parcelas **locais** na mesma data de um boleto com vínculo **Matrícula** ou **Mesmo CPF** **não** vêm marcadas para gerar local. O usuário pode marcar manualmente se quiser criar no sistema mesmo assim.

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
  - Valor da taxa vindo do plano (`enrollment_fee_amount`)
  - Dados do responsável financeiro principal detectado
  - Campos `charges_batch_generated` e `charges_generated_at` indicam se
    cobranças já foram geradas em lote nesta matrícula
```

---

## Fluxo de Cobranças (Geração)

### Opção A — Geração em lote (one-shot)

Use para gerar cobranças de **todas as invoices pendentes** de uma matrícula de uma vez.

> **Regra:** Após a execução bem-sucedida, o campo `charges_generated_at` é preenchido e a ação em lote **não pode mais ser repetida**. Por padrão, o lote gera apenas invoices do tipo `monthly`, para não recriar a taxa de matrícula. Cobranças individuais continuam disponíveis.

```
POST /api/enrollments/{id}/generate-charges
```

Body:

```json
{
  "provider": "cora",
  "method": "pix",
  "environment": "prod",
  "invoice_types": ["monthly", "enrollment_fee"]
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `provider` | ✅ | Slug do provedor. Ex: `"cora"` |
| `method` | ✅ | `"pix"` ou `"boleto"` |
| `environment` | ❌ | `"stage"` ou `"prod"`. Padrão: `"prod"` (ou `"stage"` fora de produção) |
| `invoice_types` | ❌ | Filtrar tipos. Ex: `["monthly"]`. Omitir = todas as pendentes |

**Resposta (200 — todas geradas):**

```json
{
  "type": "success",
  "message": "Cobranças geradas em lote com sucesso.",
  "body": {
    "enrollment_id": 10,
    "provider": "cora",
    "method": "pix",
    "environment": "prod",
    "status": "success",
    "generated_count": 6,
    "failed_count": 0,
    "charges_generated_at": "2026-05-17T14:00:00.000000Z",
    "generated": [
      {
        "invoice_id": 5,
        "type": "enrollment_fee",
        "due_date": "2026-05-01",
        "amount": "150.00",
        "charge_id": "inv_abc123",
        "status": "PENDING",
        "payment_url": "https://..."
      }
    ],
    "failed": []
  }
}
```

**Resposta (207 — parcial):** `"status": "partial"`, `failed` contém os IDs com erro.

**Resposta (409 — já foi gerado em lote):**

```json
{
  "type": "error",
  "message": "As cobranças em lote já foram geradas para esta matrícula em 17/05/2026 14:00.",
  "body": {
    "charges_generated_at": "2026-05-17T14:00:00.000000Z"
  }
}
```

### Fluxo recomendado no painel

```
1. Ao abrir detalhes da matrícula, verificar `charges_batch_generated`:
   - false → mostrar botão "Gerar cobranças em lote"
   - true  → exibir data de `charges_generated_at`, botão desabilitado

2. Após gerar em lote, recarregar a matrícula para atualizar status das invoices

3. Para invoices adicionais (criadas depois do lote), usar geração individual
```

---

## Fluxo de Cobrança Individual (Painel Admin + Mobile Aluno)

Depois que a matrícula gera a invoice, o fluxo recomendado para front é:

```
1. Admin (painel) gera a forma de pagamento da invoice
   POST /api/invoices/{invoice}/generate-charge
   body: { provider: "cora", method: "pix"|"boleto", environment: "stage"|"prod" }

2. Front exibe para o cliente/aluno
   - payment_url (boleto)
   - pix_copy_paste (pix)

3. Front consulta status
   GET /api/invoices/{invoice}/charge-status

4. Em stage (teste), admin pode simular pagamento
   POST /api/invoices/{invoice}/pay-charge
   body: { environment: "stage" }

5. Em produção, confirmação real ocorre por integração do provedor
```

### Endpoints de Cobrança para o Front

#### 1) Gerar cobranças em lote (one-shot por matrícula)

`POST /api/enrollments/{id}/generate-charges`

> Ver seção **Opção A — Geração em lote** acima para body e respostas completas.

#### 2) Gerar cobrança individual por invoice

`POST /api/invoices/{invoice}/generate-charge`

Body:

```json
{
  "provider": "cora",
  "method": "pix",
  "environment": "stage"
}
```

Resposta esperada:

```json
{
  "type": "success",
  "body": {
    "invoice_id": 123,
    "provider": "cora",
    "environment": "stage",
    "method": "pix",
    "charge_id": "inv_xxx",
    "status": "PENDING",
    "payment_url": "https://...",
    "pix_copy_paste": "000201...",
    "qr_code_image_url": null,
    "expires_at": null
  }
}
```

#### 3) Consultar status da cobrança

`GET /api/invoices/{invoice}/charge-status`

Resposta esperada:

```json
{
  "type": "success",
  "body": {
    "provider": "cora",
    "status": "paid",
    "paid_at": "2026-05-11T14:30:00Z"
  }
}
```

#### 3) Simular pagamento em stage (teste)

`POST /api/invoices/{invoice}/pay-charge`

Body:

```json
{
  "environment": "stage"
}
```

Resposta esperada:

```json
{
  "type": "success",
  "message": "Cobrança paga com sucesso.",
  "body": {
    "invoice_id": 123,
    "provider": "cora",
    "environment": "stage",
    "status": "IN_PAYMENT",
    "paid_at": "2026-05-13T18:30:00Z"
  }
}
```

### Regras para UX no Front

- Painel admin: mostrar botão **"Gerar cobranças em lote"** quando `charges_batch_generated = false`. Após geração, exibir data e desabilitar o botão.
- Para invoices avulsas criadas após o lote, usar geração individual (`generate-charge` na invoice).
- Painel admin: mostrar ações de gerar cobrança individual (`generate-charge`) e simular pagamento em stage (`pay-charge`).
- Mobile do aluno: exibir dados da cobrança (link/PIX/status), sem ação administrativa.
- Em stage: habilitar botão de simulação de pagamento.
- Em produção: não usar `pay-charge`; acompanhar status por atualização da cobrança.

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
