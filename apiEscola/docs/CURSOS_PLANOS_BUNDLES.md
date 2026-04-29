# Cursos, Planos e Pacotes — Documentação de API

> **Base URL:** `http://localhost:4000/api`  
> **Auth:** `Authorization: Bearer {token}` em todas as rotas  
> **Formato:** `Content-Type: application/json`

---

## Índice

1. [Cursos](#1-cursos)
2. [Planos de Curso](#2-planos-de-curso)
3. [Pacotes de Cursos (Bundles)](#3-pacotes-de-cursos-bundles)
4. [Ciclos de Cobrança](#4-ciclos-de-cobrança)
5. [Fluxo sugerido para montagem do frontend](#5-fluxo-sugerido-para-montagem-do-frontend)

---

## 1. Cursos

### `GET /courses` — Listar cursos

**Query params opcionais:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `status` | string | `active` ou `inactive` |
| `search` | string | Busca por nome |

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "tenant_id": 1,
      "name": "Curso de Programação",
      "description": "Lógica de programação e algoritmos",
      "status": "active",
      "created_at": "2026-04-01T00:00:00.000000Z",
      "updated_at": "2026-04-01T00:00:00.000000Z"
    }
  ],
  "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 1 }
}
```

---

### `POST /courses` — Criar curso

**Body:**
```json
{
  "name": "Curso de Programação",
  "description": "Lógica de programação e algoritmos",
  "status": "active"
}
```

| Campo | Tipo | Obrigatório | Observação |
|-------|------|-------------|------------|
| `name` | string | ✅ | máx. 255 caracteres |
| `description` | string | ❌ | texto livre |
| `status` | string | ❌ | `active` (padrão) ou `inactive` |

**Response `201`:** objeto Curso.

---

### `GET /courses/{id}` — Exibir curso

**Response `200`:** objeto Curso.

---

### `PUT /courses/{id}` — Atualizar curso

Mesma estrutura do `POST`. Envie apenas os campos a alterar.

**Response `200`:** objeto Curso atualizado.

---

### `DELETE /courses/{id}` — Remover curso

**Response `200`:**
```json
{ "message": "Curso removido com sucesso." }
```

---

## 2. Planos de Curso

Um curso pode ter múltiplos planos — cada plano define um **ciclo de cobrança** e seu **preço total**.

### `GET /courses/{course_id}/plans` — Listar planos do curso

**Query params opcionais:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `status` | string | `active` ou `inactive` |

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "tenant_id": 1,
      "course_id": 1,
      "course": {
        "id": 1,
        "name": "Curso de Programação"
      },
      "name": "Plano Mensal",
      "billing_cycle": "monthly",
      "cycle_label": "Mensal",
      "months_in_cycle": 1,
      "price": "200.00",
      "monthly_equivalent": 200.00,
      "status": "active",
      "created_at": "2026-04-01T00:00:00.000000Z",
      "updated_at": "2026-04-01T00:00:00.000000Z"
    },
    {
      "id": 2,
      "course_id": 1,
      "name": "Plano Semestral",
      "billing_cycle": "semiannual",
      "cycle_label": "Semestral",
      "months_in_cycle": 6,
      "price": "900.00",
      "monthly_equivalent": 150.00,
      "status": "active"
    }
  ]
}
```

---

### `POST /courses/{course_id}/plans` — Criar plano

**Body:**
```json
{
  "name": "Plano Semestral",
  "billing_cycle": "semiannual",
  "price": 900.00,
  "status": "active"
}
```

| Campo | Tipo | Obrigatório | Observação |
|-------|------|-------------|------------|
| `name` | string | ✅ | ex.: "Plano Mensal" |
| `billing_cycle` | string | ✅ | ver [Ciclos de Cobrança](#4-ciclos-de-cobrança) |
| `price` | decimal | ✅ | valor **total** do ciclo |
| `status` | string | ❌ | `active` (padrão) ou `inactive` |

**Response `201`:** objeto CoursePlan com `course` embutido.

---

### `GET /course-plans/{id}` — Exibir plano

**Response `200`:** objeto CoursePlan com `course` embutido.

---

### `PUT /course-plans/{id}` — Atualizar plano

Mesma estrutura do `POST`. Envie apenas os campos a alterar.

**Response `200`:** objeto CoursePlan atualizado.

---

### `DELETE /course-plans/{id}` — Remover plano

**Response `200`:**
```json
{ "message": "Plano removido com sucesso." }
```

---

## 3. Pacotes de Cursos (Bundles)

Um bundle agrupa **2 ou mais cursos** com preço único e ciclo de cobrança próprio.  
Ao matricular um aluno num bundle, uma matrícula é criada para cada curso do pacote.

### `GET /course-bundles` — Listar bundles

Já retorna `courses[]` embutido em cada bundle.

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "tenant_id": 1,
      "name": "CPM Completo",
      "description": "Pacote com todos os módulos",
      "billing_cycle": "semiannual",
      "cycle_label": "Semestral",
      "months_in_cycle": 6,
      "price": "900.00",
      "monthly_equivalent": 150.00,
      "status": "active",
      "courses": [
        { "id": 1, "name": "Programação", "status": "active" },
        { "id": 2, "name": "Design",      "status": "active" }
      ],
      "created_at": "2026-04-01T00:00:00.000000Z",
      "updated_at": "2026-04-28T00:00:00.000000Z"
    }
  ],
  "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 1 }
}
```

---

### `POST /course-bundles` — Criar bundle

**Body:**
```json
{
  "name": "CPM Completo",
  "description": "Pacote com todos os módulos",
  "billing_cycle": "semiannual",
  "price": 900.00,
  "status": "active",
  "course_ids": [1, 2]
}
```

| Campo | Tipo | Obrigatório | Observação |
|-------|------|-------------|------------|
| `name` | string | ✅ | máx. 255 caracteres |
| `description` | string | ❌ | texto livre |
| `billing_cycle` | string | ✅ | ver [Ciclos de Cobrança](#4-ciclos-de-cobrança) |
| `price` | decimal | ✅ | valor **total** do ciclo para o pacote inteiro |
| `status` | string | ❌ | `active` (padrão) ou `inactive` |
| `course_ids` | integer[] | ✅ | mínimo de **2 cursos** |

**Response `201`:** objeto Bundle com `courses[]` embutido.

---

### `GET /course-bundles/{id}` — Exibir bundle

**Response `200`:** objeto Bundle com `courses[]`.

---

### `PUT /course-bundles/{id}` — Atualizar bundle

Todos os campos são opcionais. Se `course_ids` for enviado, **substitui** a lista de cursos completamente (sync).

**Exemplo — alterar preço e ciclo:**
```json
{
  "billing_cycle": "annual",
  "price": 1500.00
}
```

**Exemplo — alterar cursos do pacote:**
```json
{
  "course_ids": [1, 2, 3]
}
```

**Response `200`:** objeto Bundle atualizado.

---

### `DELETE /course-bundles/{id}` — Remover bundle

**Response `200`:**
```json
{ "message": "Pacote removido com sucesso." }
```

---

## 4. Ciclos de Cobrança

Usado tanto em `CoursePlan` quanto em `CourseBundle`.

| `billing_cycle` | `cycle_label` | `months_in_cycle` | Como usar no frontend |
|-----------------|---------------|-------------------|-----------------------|
| `monthly` | Mensal | 1 | Padrão para mensalidades simples |
| `bimonthly` | Bimestral | 2 | Cobrança a cada 2 meses |
| `quadrimestral` | Quadrimestral | 4 | Cobrança a cada 4 meses |
| `semiannual` | Semestral | 6 | Cobrança semestral |
| `annual` | Anual | 12 | Cobrança anual |

### Campos calculados retornados pela API

| Campo | Fórmula | Uso |
|-------|---------|-----|
| `price` | Valor informado no cadastro | Valor total cobrado no ciclo |
| `monthly_equivalent` | `price ÷ months_in_cycle` | Exibir "a partir de R$ X/mês" |
| `cycle_label` | Label em português | Exibir no select/card |
| `months_in_cycle` | Número de meses | Cálculo de parcelas / vencimentos |

> **Não é necessário calcular no frontend** — `monthly_equivalent` já vem pronto na response.

---

## 5. Fluxo sugerido para montagem do frontend

### Tela de cadastro de Curso

```
1. POST /courses  →  salvar e redirecionar para detalhe
2. Na tela de detalhe:
   - Listar planos: GET /courses/{id}/plans
   - Botão "Adicionar Plano" → modal com POST /courses/{id}/plans
   - Editar plano → PUT /course-plans/{plan_id}
   - Remover plano → DELETE /course-plans/{plan_id}
```

---

### Tela de listagem de Cursos

```
1. GET /courses?status=active&search=...
2. Paginação via meta.current_page / meta.last_page
3. Link "Ver planos" → GET /courses/{id}/plans
```

---

### Tela de cadastro de Bundle

```
1. Carregar lista de cursos disponíveis: GET /courses?status=active
2. Usuário seleciona ≥2 cursos e define nome, ciclo, preço
3. Exibir preview de monthly_equivalent = price / months_in_cycle
4. POST /course-bundles
5. Response já retorna courses[] embutido
```

---

### Select de Ciclo de Cobrança (reutilizável)

Opções fixas (não precisam vir da API):

```js
const billingCycles = [
  { value: 'monthly',       label: 'Mensal',         months: 1  },
  { value: 'bimonthly',     label: 'Bimestral',       months: 2  },
  { value: 'quadrimestral', label: 'Quadrimestral',   months: 4  },
  { value: 'semiannual',    label: 'Semestral',       months: 6  },
  { value: 'annual',        label: 'Anual',           months: 12 },
]
```

---

### Card de Plano / Bundle — exibição recomendada

```
┌────────────────────────────────────┐
│  Plano Semestral                   │
│  Curso de Programação              │
│                                    │
│  R$ 900,00 / semestre              │
│  (equivalente a R$ 150,00/mês)     │
│                                    │
│  [Matricular]                      │
└────────────────────────────────────┘
```

Mapeamento de campos:
- **Título:** `plan.name` ou `bundle.name`
- **Ciclo:** `plan.cycle_label`
- **Valor do ciclo:** `plan.price`
- **Equivalente mensal:** `plan.monthly_equivalent`

---

### Resumo das rotas

| Ação | Método | Rota |
|------|--------|------|
| Listar cursos | `GET` | `/courses` |
| Criar curso | `POST` | `/courses` |
| Exibir curso | `GET` | `/courses/{id}` |
| Atualizar curso | `PUT` | `/courses/{id}` |
| Remover curso | `DELETE` | `/courses/{id}` |
| Listar planos do curso | `GET` | `/courses/{id}/plans` |
| Criar plano | `POST` | `/courses/{id}/plans` |
| Exibir plano | `GET` | `/course-plans/{id}` |
| Atualizar plano | `PUT` | `/course-plans/{id}` |
| Remover plano | `DELETE` | `/course-plans/{id}` |
| Listar bundles | `GET` | `/course-bundles` |
| Criar bundle | `POST` | `/course-bundles` |
| Exibir bundle | `GET` | `/course-bundles/{id}` |
| Atualizar bundle | `PUT` | `/course-bundles/{id}` |
| Remover bundle | `DELETE` | `/course-bundles/{id}` |
