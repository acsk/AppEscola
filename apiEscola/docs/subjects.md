# Subjects (Disciplinas)

## Arquivos envolvidos

| Caminho | Responsabilidade |
|---|---|
| `database/migrations/2024_01_01_000006_create_subjects_table.php` | Cria a tabela `subjects` |
| `database/migrations/2026_05_03_000012_add_icon_color_to_subjects_table.php` | Adiciona `icon` e `color` |
| `app/Models/Subject.php` | Model Eloquent |
| `app/Http/Controllers/Api/SubjectController.php` | CRUD completo |
| `app/Http/Requests/StoreSubjectRequest.php` | Validação para criação |
| `app/Http/Requests/UpdateSubjectRequest.php` | Validação para atualização |
| `app/Http/Resources/SubjectResource.php` | Transformação do recurso na resposta |

---

## Tabela: `subjects`

| Coluna | Tipo | Nullable | Padrão | Descrição |
|---|---|---|---|---|
| `id` | bigint PK | não | auto | |
| `tenant_id` | bigint FK | não | — | Referência a `tenants.id` |
| `name` | varchar(255) | não | — | Nome da disciplina, único por tenant |
| `description` | text | sim | null | Descrição |
| `icon` | varchar(255) | sim | null | Nome ou código do ícone |
| `color` | varchar(9) | sim | null | Cor em hex (`#RGB`, `#RRGGBB`, `#RRGGBBAA`) |
| `status` | varchar | não | `active` | `active` \| `inactive` |
| `created_at` | timestamp | sim | — | |
| `updated_at` | timestamp | sim | — | |
| `deleted_at` | timestamp | sim | null | Soft delete |

---

## Endpoints

> **Base:** `/api/subjects`  
> **Auth:** `Authorization: Bearer {token}`  
> **Multi-tenant:** o `tenant_id` é inferido automaticamente do token/header — não enviar no body.

---

### GET /api/subjects

Lista disciplinas do tenant paginadas (20 por página), ordenadas por nome.

**Query params (opcionais):**

| Parâmetro | Tipo | Exemplo | Descrição |
|---|---|---|---|
| `status` | string | `active` | Filtra por status |
| `search` | string | `mat` | Busca parcial no nome |

**Resposta `200`:**

```json
{
  "data": [
    {
      "id": 1,
      "tenant_id": 1,
      "name": "Matemática",
      "description": "Disciplina de matemática básica",
      "icon": "calculator",
      "color": "#3B82F6",
      "status": "active",
      "created_at": "2026-05-03T20:00:00.000000Z",
      "updated_at": "2026-05-03T20:00:00.000000Z"
    }
  ],
  "links": { ... },
  "meta": { "current_page": 1, "last_page": 1, "total": 1 }
}
```

---

### POST /api/subjects

Cria uma nova disciplina.

**Body:**

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `name` | string | sim | max 255 |
| `description` | string | não | texto livre |
| `icon` | string | não | max 100 — nome do ícone da biblioteca usada no frontend |
| `color` | string | não | hex válido: `#RGB`, `#RRGGBB` ou `#RRGGBBAA` |
| `status` | string | não | `active` (padrão) ou `inactive` |

> O campo `name` deve ser único dentro do mesmo tenant.

**Exemplo:**

```json
{
  "name": "Matemática",
  "description": "Disciplina de matemática básica",
  "icon": "calculator",
  "color": "#3B82F6",
  "status": "active"
}
```

**Resposta `201`:**

```json
{
  "type": "success",
  "message": "Criado com sucesso.",
  "body": {
    "id": 1,
    "tenant_id": 1,
    "name": "Matemática",
    "description": "Disciplina de matemática básica",
    "icon": "calculator",
    "color": "#3B82F6",
    "status": "active",
    "created_at": "2026-05-03T20:00:00.000000Z",
    "updated_at": "2026-05-03T20:00:00.000000Z"
  }
}
```

---

### GET /api/subjects/{id}

Retorna os dados de uma disciplina.

**Resposta `200`:** mesmo objeto de `body` do POST acima.  
**Resposta `403`:** disciplina pertence a outro tenant.  
**Resposta `404`:** disciplina não encontrada.

---

### PUT /api/subjects/{id}

Atualiza uma disciplina. Todos os campos são opcionais (`sometimes`).

**Body (parcial):**

```json
{
  "icon": "book-open",
  "color": "#10B981"
}
```

**Resposta `200`:** mesmo envelope de sucesso com o objeto atualizado.

---

### DELETE /api/subjects/{id}

Remove (soft delete) uma disciplina.

**Resposta `200`:**

```json
{ "message": "Disciplina removida com sucesso." }
```

---

## Campos `icon` e `color`

### `icon`

Campo de texto livre. Recomenda-se usar nomes de ícones da biblioteca adotada no frontend/mobile (ex: Lucide, Heroicons, MaterialIcons). Exemplos:

| Disciplina | Sugestão de ícone |
|---|---|
| Matemática | `calculator` |
| Português | `book-open` |
| Ciências | `flask-conical` |
| História | `landmark` |
| Geografia | `globe` |
| Educação Física | `dumbbell` |
| Inglês | `languages` |

### `color`

Hex RGB/RGBA. Exemplos de paleta:

| Cor | Hex |
|---|---|
| Azul | `#3B82F6` |
| Verde | `#10B981` |
| Vermelho | `#EF4444` |
| Laranja | `#F97316` |
| Roxo | `#8B5CF6` |
| Rosa | `#EC4899` |
| Amarelo | `#EAB308` |

---

## Relacionamentos

```
Subject
 └─ hasMany ClassSchedule  (grade horária)
 └─ belongsTo Tenant
```

---

## Erros comuns

| Código | Causa |
|---|---|
| `401` | Token ausente ou expirado |
| `403` | Disciplina pertence a outro tenant |
| `404` | ID não existe ou foi removido (soft delete) |
| `422` | `color` fora do formato hex, `status` inválido, `name` ausente no POST |
