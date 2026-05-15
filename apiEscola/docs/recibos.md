# Recibos de Pagamento — Contrato de API

Retorna os dados estruturados de um recibo para invoices **já pagas**.  
O backend não gera PDF — o frontend é responsável por renderizar/imprimir.

---

## Endpoints

### Painel (admin)

```
GET /api/invoices/{invoice_id}/receipt
Authorization: Bearer {token}
```

### Mobile (aluno)

```
GET /api/aluno/cobrancas/{invoice_id}/receipt
Authorization: Bearer {token}   ← token do aluno (role: aluno)
```

---

## Resposta de sucesso — 200

Envelope padrão `{ type, message, body }`.

```json
{
  "type": "success",
  "message": "Recibo gerado com sucesso.",
  "body": {
    "receipt_number": "REC-2025-000042",
    "receipt_hash": "e3b0c44298fc1c149afb...sha256...",
    "issued_at": "2025-05-15T14:32:00.000000Z",

    "school": {
      "name": "Cursinho Exemplo",
      "corporate_name": "Cursinho Exemplo Ltda",
      "cnpj": "12.345.678/0001-99",
      "email": "contato@cursinhoexemplo.com.br",
      "phone": "(11) 99999-9999",
      "logo_url": "https://cdn.example.com/logo.png",
      "address": "Rua das Flores, n° 100, Sala 2, Centro, São Paulo/SP"
    },

    "student": {
      "name": "JOÃO DA SILVA",
      "document": "123.456.789-00",
      "email": "joao@email.com",
      "phone": "(11) 91234-5678"
    },

    "payer": {
      "name": "MARIA DA SILVA",
      "document": "987.654.321-00",
      "is_guardian": true,
      "guardian_name": "MARIA DA SILVA"
    },

    "enrollment": {
      "id": 7,
      "enrollment_number": "2025001",
      "school_class": "Turma A - Manhã",
      "start_date": "2025-02-01",
      "end_date": "2025-12-31"
    },

    "invoice": {
      "id": 42,
      "description": "Mensalidade Maio/2025",
      "type": "monthly",
      "amount": "1.200,00",
      "amount_raw": 1200.00,
      "due_date": "2025-05-10",
      "paid_at": "2025-05-08T10:45:00.000000Z",
      "paid_at_date": "2025-05-08",
      "paid_at_time": "10:45",
      "payment_method": "PIX",
      "payment_method_slug": "pix",
      "cora_charge_id": "cob_abc123",
      "notes": null
    },

    "verification": {
      "message": "Este documento é um comprovante eletrônico de pagamento.",
      "verify_hash": "e3b0c44298fc1c149afb...sha256..."
    }
  }
}
```

---

## Campos

### `receipt_number`
Número do recibo no formato `REC-{ano}-{id_invoice_com_6_digitos}`.  
Ex.: `REC-2025-000042`. Pode ser exibido no cabeçalho do recibo.

### `receipt_hash`
SHA-256 determinístico calculado a partir de dados imutáveis da invoice (`id`, `tenant_id`, `student_id`, `amount`, `paid_at`, `payment_method`).  
Serve para verificação de autenticidade — o mesmo hash sempre será gerado para a mesma invoice paga.

### `issued_at`
Momento em que o recibo foi gerado (ISO 8601). Não é a data de pagamento.

### `school`
Dados do tenant (escola) para o cabeçalho do recibo.

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | string | Nome fantasia da escola |
| `corporate_name` | string\|null | Razão social |
| `cnpj` | string | CNPJ formatado (`XX.XXX.XXX/XXXX-XX`) |
| `email` | string\|null | E-mail de contato |
| `phone` | string\|null | Telefone de contato |
| `logo_url` | string\|null | URL da logo para exibir no topo do recibo |
| `address` | string\|null | Endereço completo formatado |

### `student`
Dados do aluno vinculado à cobrança.

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | string | Nome sempre em MAIÚSCULAS |
| `document` | string | CPF formatado (`XXX.XXX.XXX-XX`) |
| `email` | string\|null | E-mail do aluno |
| `phone` | string\|null | Telefone do aluno |

### `payer`
Quem pagou — responsável financeiro quando existir, caso contrário o próprio aluno.

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | string | Nome do pagador |
| `document` | string | CPF/CNPJ formatado |
| `is_guardian` | bool | `true` se o pagador é um responsável |
| `guardian_name` | string\|null | Nome do responsável (apenas quando `is_guardian = true`) |

### `enrollment`
Dados da matrícula vinculada, ou `null` se a invoice não tiver matrícula.

### `invoice`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | int | ID da invoice |
| `description` | string | Descrição da cobrança |
| `type` | string | Tipo da invoice (ex.: `monthly`, `enrollment_fee`) |
| `amount` | string | Valor formatado em real (`1.200,00`) |
| `amount_raw` | float | Valor numérico bruto para cálculos |
| `due_date` | string | Data de vencimento (`YYYY-MM-DD`) |
| `paid_at` | string | Data/hora do pagamento (ISO 8601) |
| `paid_at_date` | string | Apenas a data do pagamento (`YYYY-MM-DD`) |
| `paid_at_time` | string | Apenas o horário do pagamento (`HH:mm`) |
| `payment_method` | string | Rótulo legível: `PIX`, `Boleto Bancário`, `Dinheiro`, etc. |
| `payment_method_slug` | string | Slug interno: `pix`, `bank_slip`, `cash`, `transfer` |
| `cora_charge_id` | string\|null | ID da cobrança no gateway (Cora) |
| `notes` | string\|null | Observações internas da invoice |

---

## Erros

### 422 — Invoice não está paga

```json
{
  "type": "error",
  "message": "Recibo disponível apenas para cobranças pagas.",
  "body": null
}
```

### 403 — Sem permissão

```json
{
  "type": "error",
  "message": "Recibo não pertence ao tenant autenticado.",
  "body": null
}
```

Para o mobile, pode retornar também:  
`"Aluno não encontrado ou inativo."` ou `"Cobrança não pertence ao aluno autenticado."`

### 404 — Invoice não encontrada

Retornado automaticamente pelo Laravel quando `{invoice_id}` não existe no banco.

---

## Integração com a tela de cobranças

O fluxo esperado é:

1. Exibir lista de cobranças (endpoint `/aluno/boletos` ou listagem admin).
2. Para cobranças com `status = "paid"`, exibir botão **"Ver recibo"** ou ícone de recibo.
3. Ao clicar, chamar `GET /api/aluno/cobrancas/{invoice}/receipt` (mobile) ou `GET /api/invoices/{invoice}/receipt` (painel).
4. Renderizar os dados recebidos em um componente de recibo (modal, nova tela ou página de impressão).

### Sugestão de campos a exibir no recibo impresso

```
┌─────────────────────────────────────────────────┐
│  [logo_url]   NOME DA ESCOLA                    │
│               CNPJ: XX.XXX.XXX/XXXX-XX          │
│               Endereço completo                  │
├─────────────────────────────────────────────────┤
│  RECIBO DE PAGAMENTO             REC-2025-000042 │
├─────────────────────────────────────────────────┤
│  Aluno:        JOÃO DA SILVA                    │
│  Pagador:      MARIA DA SILVA (CPF: ...)         │
│  Matrícula:    2025001 — Turma A - Manhã         │
├─────────────────────────────────────────────────┤
│  Descrição:    Mensalidade Maio/2025             │
│  Vencimento:   10/05/2025                        │
│  Pagamento:    08/05/2025 às 10:45               │
│  Método:       PIX                               │
│  Valor:        R$ 1.200,00                       │
├─────────────────────────────────────────────────┤
│  Verificação: e3b0c442...                        │
│  Este documento é um comprovante eletrônico.     │
└─────────────────────────────────────────────────┘
```

### Verificar autenticidade do recibo

O campo `receipt_hash` é determinístico — chamar o endpoint novamente para o mesmo `invoice_id` sempre retorna o mesmo hash. O frontend pode exibi-lo como código de verificação ou gerar um QR Code com ele.

---

## Observações

- O backend **não gera PDF**. O frontend deve usar a API de impressão do browser (`window.print()`) ou uma biblioteca como `jsPDF` / `react-pdf`.
- O campo `amount` está formatado para exibição em pt-BR. Para cálculos, use `amount_raw`.
- O campo `name` do aluno está sempre em MAIÚSCULAS (normalizado pelo backend).
- `enrollment` pode ser `null` para invoices avulsas não vinculadas a uma matrícula.
- `logo_url` pode ser `null` — trate no frontend com uma logo padrão.
