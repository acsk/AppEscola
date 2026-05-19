# Configurações de cobrança por tenant — Frontend Painel

Documento de integração para a tela de **Configurações de cobrança** do painel administrativo. Permite que cada escola (tenant) personalize regras de matrícula, geração de cobranças e métodos de pagamento aceitos.

---

## 1. Autenticação e permissões

- Todas as rotas estão sob `auth:sanctum` + middleware `IdentifyTenant` (envia o header `X-Tenant-ID` ou similar já usado no painel).
- Quem pode **ler/escrever**:
  - `super_admin` — sempre; pode operar sobre outro tenant passando `?tenant_id={id}` em qualquer rota.
  - Usuários do próprio tenant com role `admin`, `manager` ou `financial`.
  - Demais roles recebem **403 Forbidden**.

---

## 2. Endpoints

Base: `/api/tenant-billing-settings`

| Método | Rota                              | Descrição                                                         |
| ------ | --------------------------------- | ----------------------------------------------------------------- |
| GET    | `/schema`                         | Catálogo de campos (tipos, defaults, labels, options).            |
| GET    | `/`                               | Valores atuais de **todos** os escopos para o tenant corrente.    |
| GET    | `/{scope}`                        | Valores atuais de **um** escopo (`billing`, `payment`, `enrollment`). |
| PUT    | `/{scope}`                        | Atualiza chaves do escopo. Body: `{ "values": { ... } }`.         |
| POST   | `/{scope}/reset`                  | Remove valores salvos do escopo (volta aos defaults do schema).   |

Todas as respostas seguem o padrão da API:

```json
{
  "type": "success",
  "message": "…",
  "body": { ... }
}
```

Erros usam `type: "error"` e status HTTP apropriado (`403`, `404`, `422`).

---

## 3. Schema (catálogo de campos)

`GET /api/tenant-billing-settings/schema` retorna a definição usada para montar o formulário dinâmico. Use o schema como **fonte da verdade** para tipos, defaults, labels e descrições — não duplique no front.

### Estrutura do schema

```json
{
  "type": "success",
  "message": "Schema de configurações carregado.",
  "body": {
    "billing": {
      "charges_enrollment_fee": {
        "type": "bool",
        "default": true,
        "label": "Cobrar taxa de matrícula",
        "description": "Quando desativado, nenhuma invoice de enrollment_fee é criada ao matricular o aluno."
      },
      "default_payment_due_day": {
        "type": "int",
        "default": 10,
        "min": 1,
        "max": 28,
        "label": "Dia padrão de vencimento",
        "description": "..."
      },
      "...": {}
    },
    "payment": {
      "enabled_methods": {
        "type": "array",
        "default": ["pix", "boleto"],
        "options": ["pix", "boleto", "bank_slip", "credit_card", "debit_card", "cash", "transfer"],
        "label": "Métodos de pagamento habilitados",
        "description": "..."
      },
      "default_provider": {
        "type": "string",
        "default": "cora",
        "options": ["cora", "manual"],
        "label": "Provedor padrão"
      },
      "...": {}
    },
    "enrollment": { "..." : {} }
  }
}
```

### Tipos suportados

| `type`   | Componente sugerido no front           | Regras de validação                                                  |
| -------- | -------------------------------------- | -------------------------------------------------------------------- |
| `bool`   | `Switch` / `Checkbox`                  | Aceita `true`/`false`, `"1"/"0"`, `"true"/"false"`, `"yes"/"no"`.    |
| `int`    | `NumberInput` (com `min`/`max`)        | Inteiro entre `min` e `max` (quando definidos).                      |
| `string` | `Select` se `options` existir, senão `Input` | Quando há `options`, valor deve estar na lista.                |
| `array`  | `MultiSelect` ou grupo de checkboxes (usando `options`) | Cada item deve estar em `options`; duplicatas são removidas. |

### Catálogo atual (resumo)

#### Escopo `billing`

| Chave                                | Tipo | Default | Observações |
| ------------------------------------ | ---- | ------- | ----------- |
| `charges_enrollment_fee`             | bool | `true`  | Se `false`, **não cria invoice de taxa de matrícula** em `subscribe`, `subscribeBundle` nem em `generateCharges`. |
| `enrollment_fee_covers_first_month`  | bool | `false` | Reservado para fluxo futuro (a geração de mensalidades começaria do 2º mês). |
| `allow_monthlies_before_fee_paid`    | bool | `true`  | Se `false` e existir taxa de matrícula `pending`/`overdue`, `generateCharges` bloqueia `monthly` com **422**. |
| `default_payment_due_day`            | int  | `10`    | Range 1–28. Usado quando `payment_due_day` não vier no payload de matrícula/lote. |

#### Escopo `payment`

| Chave                | Tipo   | Default            | Observações |
| -------------------- | ------ | ------------------ | ----------- |
| `enabled_methods`    | array  | `["pix","boleto"]` | Restringe `method` aceito em `POST /api/invoices/{id}/generate-charge`. `bank_slip` é normalizado para `boleto`. |
| `default_provider`   | string | `"cora"`           | Provedor sugerido quando o front não informar. |
| `default_method`     | string | `"boleto"`         | Usado como fallback em `generate-charge` quando o front omite `method`. |
| `auto_sync_charges`  | bool   | `true`             | Liga jobs de sincronização de status com o provedor. |

#### Escopo `enrollment`

| Chave                          | Tipo | Default | Observações |
| ------------------------------ | ---- | ------- | ----------- |
| `require_cpf_to_enroll`        | bool | `true`  | (Flag de UI/validação — gates específicos a aplicar no fluxo de matrícula). |
| `require_guardian_for_minors`  | bool | `true`  | (Flag de UI/validação.) |

> O schema é a referência viva. Novas chaves aparecerão automaticamente em `GET /schema` — o painel só precisa renderizar o que o catálogo retornar.

---

## 4. Ler valores

### Todos os escopos

`GET /api/tenant-billing-settings`

```json
{
  "type": "success",
  "message": "Configurações carregadas.",
  "body": {
    "tenant_id": 3,
    "settings": {
      "billing": {
        "charges_enrollment_fee": true,
        "enrollment_fee_covers_first_month": false,
        "allow_monthlies_before_fee_paid": true,
        "default_payment_due_day": 10
      },
      "payment": {
        "enabled_methods": ["pix", "boleto"],
        "default_provider": "cora",
        "default_method": "boleto",
        "auto_sync_charges": true
      },
      "enrollment": {
        "require_cpf_to_enroll": true,
        "require_guardian_for_minors": true
      }
    }
  }
}
```

Os valores retornados já vêm **mesclados com os defaults**: o front sempre recebe todas as chaves, mesmo que o tenant nunca tenha salvo nada.

### Um escopo só

`GET /api/tenant-billing-settings/billing`

```json
{
  "type": "success",
  "message": "Configurações do escopo 'billing'.",
  "body": {
    "tenant_id": 3,
    "scope": "billing",
    "values": {
      "charges_enrollment_fee": true,
      "enrollment_fee_covers_first_month": false,
      "allow_monthlies_before_fee_paid": true,
      "default_payment_due_day": 10
    }
  }
}
```

Erro se o escopo não existir:

```json
{ "type": "error", "message": "Escopo 'foo' inválido.", "body": null }
```
HTTP `404`.

---

## 5. Atualizar valores

`PUT /api/tenant-billing-settings/{scope}`

Envie só as chaves que mudaram. Chaves desconhecidas são **ignoradas silenciosamente** (não geram erro). Valores inválidos para o tipo também são ignorados — boa prática é validar no front antes de enviar.

### Request

```http
PUT /api/tenant-billing-settings/billing
Content-Type: application/json

{
  "values": {
    "charges_enrollment_fee": false,
    "default_payment_due_day": 5
  }
}
```

### Response

```json
{
  "type": "success",
  "message": "Configurações do escopo 'billing' atualizadas.",
  "body": {
    "tenant_id": 3,
    "scope": "billing",
    "values": {
      "charges_enrollment_fee": false,
      "enrollment_fee_covers_first_month": false,
      "allow_monthlies_before_fee_paid": true,
      "default_payment_due_day": 5
    }
  }
}
```

### Validação do request

| Campo    | Regras                          |
| -------- | ------------------------------- |
| `values` | obrigatório, array (objeto JSON) |

Se faltar ou vier malformado → **422** com erros padrão do Laravel.

---

## 6. Resetar um escopo

`POST /api/tenant-billing-settings/{scope}/reset`

Remove o escopo do JSON salvo. Subsequentes leituras retornam os defaults do schema.

```json
{
  "type": "success",
  "message": "Configurações do escopo 'billing' resetadas para o padrão.",
  "body": {
    "tenant_id": 3,
    "scope": "billing",
    "values": {
      "charges_enrollment_fee": true,
      "enrollment_fee_covers_first_month": false,
      "allow_monthlies_before_fee_paid": true,
      "default_payment_due_day": 10
    }
  }
}
```

---

## 7. Atalho para super_admin

Em qualquer rota, super_admin pode passar `?tenant_id={id}` para operar em outro tenant. Ex.:

```
GET  /api/tenant-billing-settings?tenant_id=5
PUT  /api/tenant-billing-settings/payment?tenant_id=5
POST /api/tenant-billing-settings/billing/reset?tenant_id=5
```

Usuários normais que tentarem isso recebem **403**.

---

## 8. Como as configurações afetam o resto da API

> Use isso para mostrar mensagens claras no painel e para esconder/desabilitar opções no fluxo de matrícula e cobrança.

### `EnrollmentController::subscribe` / `subscribeBundle`
- `billing.charges_enrollment_fee = false` → resposta vem **sem** `enrollment_fee` (campo pode ser `null` no bundle). O painel deve esconder a UI de "pagamento da taxa".
- `billing.default_payment_due_day` é usado quando o front omite `payment_due_day` no body.

### `EnrollmentController::generateCharges`
- Se `billing.charges_enrollment_fee = false`, o tipo `enrollment_fee` é descartado do lote (não dá erro).
- Se `billing.allow_monthlies_before_fee_paid = false` **e** existe taxa de matrícula `pending`/`overdue` → retorna **422**:
  ```json
  {
    "type": "error",
    "message": "Não é possível gerar mensalidades enquanto a taxa de matrícula não estiver paga.",
    "body": { "enrollment_id": 42 }
  }
  ```

### `PaymentProviderController::generateCharge` (`POST /api/invoices/{id}/generate-charge`)
- Se o front omite `method`, o backend usa `payment.default_method`.
- Se `method` (normalizado: `bank_slip` → `boleto`) **não está** em `payment.enabled_methods` → **422**:
  ```json
  {
    "type": "error",
    "message": "Método de pagamento não habilitado para este tenant.",
    "body": {
      "requested_method": "pix",
      "enabled_methods": ["boleto"]
    }
  }
  ```
- Recomenda-se que o front filtre as opções do seletor de método pela lista `payment.enabled_methods`.

---

## 9. Sugestão de UX no painel

1. Tela única **"Configurações → Cobrança"** com tabs por escopo: **Cobrança**, **Pagamento**, **Matrícula**.
2. Carrega `GET /schema` uma vez (pode cachear por sessão) + `GET /` para os valores.
3. Renderiza o formulário dinamicamente a partir do schema (ver tabela de componentes acima).
4. Botão **Salvar** envia apenas o escopo da tab via `PUT /{scope}`.
5. Botão secundário **Restaurar padrões** dispara `POST /{scope}/reset` (com confirmação).
6. Exibir `description` como helper text abaixo de cada campo.
7. Mostrar badge/alerta em outras telas do sistema quando uma config altera o fluxo, por exemplo:
   - Tela de matrícula: "Taxa de matrícula desativada nas configurações" quando `charges_enrollment_fee = false`.
   - Tela de geração de cobrança: ocultar métodos fora de `enabled_methods`.

---

## 10. Códigos HTTP

| Status | Quando                                                                 |
| ------ | ---------------------------------------------------------------------- |
| 200    | Sucesso em GET / PUT / reset.                                          |
| 403    | Usuário sem permissão (role inválido ou tentando outro tenant).        |
| 404    | Tenant não encontrado ou escopo inválido.                              |
| 422    | Body inválido (ex.: `values` ausente em PUT).                          |
