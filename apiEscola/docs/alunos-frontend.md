# Cadastro de Alunos — Guia para o Frontend

**Base URL:** `http://localhost:4000/api`  
**Autenticação:** todas as rotas exigem `Authorization: Bearer {token}`

---

## Endpoints

| Método | URL | Descrição |
|---|---|---|
| `GET` | `/api/students` | Listar alunos (paginado) |
| `POST` | `/api/students` | Criar aluno + responsáveis |
| `GET` | `/api/students/{id}` | Exibir aluno |
| `PUT` | `/api/students/{id}` | Atualizar aluno + responsáveis |
| `GET` | `/api/students/{id}/guardians/available` | Listar responsáveis do tenant com vínculo do aluno |
| `POST` | `/api/students/{id}/upload-photo` | Upload da foto do aluno |
| `DELETE` | `/api/students/{id}` | Remover aluno |

---

## Listar alunos

```http
GET /api/students
Authorization: Bearer {token}
```

**Query params opcionais:**

| Parâmetro | Tipo | Exemplo | Descrição |
|---|---|---|---|
| `search` | string | `João` | Busca parcial por nome |
| `status` | string | `active` | Filtrar por status |
| `is_minor` | boolean | `true` | Apenas menores de idade |
| `page` | integer | `2` | Página (default: 1, 20 por página) |

---

## Criar aluno

```http
POST /api/students
Authorization: Bearer {token}
Content-Type: application/json
```

### Body completo (com responsáveis)

```json
{
  "name": "João da Silva",
  "birth_date": "2008-05-15",
  "document": "123.456.789-00",
  "email": "joao@email.com",
  "phone": "(11) 99999-0000",
  "photo_url": null,
  "is_minor": true,
  "status": "active",
  "guardians": [
    {
      "name": "Maria Silva",
      "document": "987.654.321-00",
      "email": "maria@email.com",
      "phone": "(11) 98888-0000",
      "relationship": "mother",
      "is_financial_responsible": true,
      "is_pedagogical_responsible": true,
      "can_access_portal": true
    },
    {
      "name": "Carlos Silva",
      "phone": "(11) 97777-0000",
      "relationship": "father",
      "is_financial_responsible": false,
      "is_pedagogical_responsible": false,
      "can_access_portal": true
    }
  ]
}
```

### Vincular responsável já cadastrado

Se o responsável já existe no sistema, use `guardian_id` ao invés de passar os dados:

```json
{
  "name": "João da Silva",
  "birth_date": "2008-05-15",
  "is_minor": true,
  "guardians": [
    {
      "guardian_id": 5,
      "is_financial_responsible": true,
      "is_pedagogical_responsible": true,
      "can_access_portal": true
    }
  ]
}
```

Também é válido **misturar**: um responsável existente (`guardian_id`) e um novo (sem `guardian_id`):

```json
{
  "name": "João da Silva",
  "guardians": [
    { "guardian_id": 5, "is_financial_responsible": true },
    { "name": "Tia Fernanda", "relationship": "other", "is_financial_responsible": false }
  ]
}
```

### Campos do aluno

| Campo | Obrigatório | Tipo | Notas |
|---|---|---|---|
| `name` | ✅ | string | max 255 |
| `birth_date` | ❌ | date | `YYYY-MM-DD`, deve ser antes de hoje |
| `document` | ❌ | string | CPF ou RG, max 20 |
| `email` | ❌ | email | max 255 |
| `phone` | ❌ | string | max 20 |
| `is_minor` | ❌ | boolean | default `false` |
| `status` | ❌ | string | slug de `GET /api/domains/statuses` (default: `active`) |
| `guardians` | ❌ | array | lista de responsáveis (ver abaixo) |

### Campos de cada responsável em `guardians[]`

| Campo | Obrigatório | Tipo | Notas |
|---|---|---|---|
| `guardian_id` | ❌ | integer | ID de responsável já cadastrado. Se informado, os dados pessoais abaixo são ignorados |
| `name` | ✅ se sem `guardian_id` | string | max 255 |
| `document` | ❌ | string | max 20 |
| `email` | ❌ | email | max 255 |
| `phone` | ❌ | string | max 20 |
| `relationship` | ❌ | string | slug de `GET /api/domains/guardian-relationships` (ex: `mother`, `father`, `other`) |
| `is_financial_responsible` | ❌ | boolean | Pode haver mais de um responsável financeiro |
| `is_pedagogical_responsible` | ❌ | boolean | |
| `can_access_portal` | ❌ | boolean | default `true` |

> **Atenção:** para alunos menores, é obrigatório informar pelo menos um responsável financeiro. O sistema aceita mais de um responsável financeiro no mesmo aluno.

### Listar responsáveis disponíveis para seleção

Use este endpoint para montar uma tela de seleção de responsáveis do aluno, sem depender de digitar CPF manualmente:

```http
GET /api/students/{id}/guardians/available
Authorization: Bearer {token}
```

**Resposta 200:**

```json
{
  "student_id": 12,
  "guardians": [
    {
      "id": 8,
      "name": "Maria Silva",
      "document": "98765432100",
      "is_linked": true,
      "pivot": {
        "is_financial_responsible": true,
        "is_pedagogical_responsible": false,
        "can_access_portal": true
      }
    },
    {
      "id": 15,
      "name": "Carlos Silva",
      "document": "12345678900",
      "is_linked": false,
      "pivot": null
    }
  ]
}
```

No frontend, a recomendação é:
- listar os responsáveis do tenant;
- permitir marcar/desmarcar `is_financial_responsible`;
- salvar a lista inteira no `PUT /api/students/{id}` ou via vínculo individual em `POST /api/students/{student_id}/guardians`.

---

### Resposta 201 — Aluno criado

```json
{
  "id": 12,
  "tenant_id": 1,
  "user_id": null,
  "name": "João da Silva",
  "birth_date": "2008-05-15",
  "document": "123.456.789-00",
  "email": "joao@email.com",
  "phone": "(11) 99999-0000",
  "is_minor": true,
  "status": "active",
  "guardians": [
    {
      "id": 8,
      "tenant_id": 1,
      "name": "Maria Silva",
      "document": "987.654.321-00",
      "email": "maria@email.com",
      "phone": "(11) 98888-0000",
      "relationship": "mother",
      "pivot": {
        "is_financial_responsible": true,
        "is_pedagogical_responsible": true,
        "can_access_portal": true
      }
    }
  ],
  "created_at": "2026-04-28T20:00:00.000000Z",
  "updated_at": "2026-04-28T20:00:00.000000Z"
}
```

---

## Exibir aluno

```http
GET /api/students/{id}
Authorization: Bearer {token}
```

Retorna o mesmo objeto acima, com `guardians` sempre carregado.

---

## Atualizar aluno

```http
PUT /api/students/{id}
Authorization: Bearer {token}
Content-Type: application/json
```

- Todos os campos do aluno são opcionais (envie apenas o que mudar).
- **Se `guardians` for enviado**, ele **substitui toda a lista** de responsáveis vinculados ao aluno — tanto vínculos quanto dados de responsáveis novos.
- **Se `guardians` não for enviado**, a lista de responsáveis **não é alterada**.

**Exemplo — apenas atualizar nome e status:**
```json
{
  "name": "João da Silva Santos",
  "status": "inactive"
}
```

**Exemplo — substituir lista de responsáveis:**
```json
{
  "guardians": [
    {
      "guardian_id": 8,
      "is_financial_responsible": true,
      "is_pedagogical_responsible": true,
      "can_access_portal": true
    }
  ]
}
```

---

## Upload da foto do aluno

Use o mesmo endpoint para painel web e app mobile.

```http
POST /api/students/{id}/upload-photo
Authorization: Bearer {token}
Content-Type: multipart/form-data

photo: (arquivo)
```

### Regras

| Campo | Regra |
|---|---|
| `photo` | obrigatório |
| Tipo | imagem (`jpg`, `jpeg`, `png`, `webp`) |
| Tamanho máximo | 5 MB |

### Resposta 200

```json
{
  "type": "success",
  "message": "Foto enviada com sucesso.",
  "body": {
    "student_id": 12,
    "photo_url": "http://localhost:4000/storage/exam-questions/1/students/12/foto.png",
    "path": "exam-questions/1/students/12/foto.png"
  }
}
```

Depois do upload, o `GET /api/students/{id}` e o `GET /api/students` passam a retornar o campo `photo_url` preenchido.

---

## Remover aluno

```http
DELETE /api/students/{id}
Authorization: Bearer {token}
```

**Resposta 200:**
```json
{ "message": "Aluno removido com sucesso." }
```

Soft delete — o registro permanece no banco e pode ser consultado em relatórios.

---

## Erros comuns

| HTTP | Motivo | Campo no erro |
|---|---|---|
| 422 | `name` não enviado | `name` |
| 422 | Dois ou mais `is_financial_responsible: true` | `guardians` |
| 422 | `guardian_id` não existe | `guardians.0.guardian_id` |
| 422 | `relationship` com slug inválido | `guardians.0.relationship` |
| 401 | Token ausente ou inválido | — |
| 403 | Aluno de outro tenant | — |

**Formato 422:**
```json
{
  "message": "Apenas um responsável financeiro pode ser definido.",
  "errors": {
    "guardians": ["Apenas um responsável financeiro pode ser definido."]
  }
}
```

---

## Lookups necessários para popular os selects

Carregar uma vez ao iniciar a tela:

```http
GET /api/domains/statuses                — status do aluno
GET /api/domains/guardian-relationships  — tipo de parentesco
```

**Formato:**
```json
[
  { "slug": "mother", "label": "Mãe" },
  { "slug": "father", "label": "Pai" },
  { "slug": "other",  "label": "Outro" }
]
```

Use o `slug` como valor no campo e o `label` para exibição.
