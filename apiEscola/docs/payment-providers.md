# Provedores de Pagamento — CRUD API

Endpoint para cadastro e gerenciamento de provedores de pagamento (bancos, carteiras digitais, métodos de pagamento) com suporte a logo/ícone.

---

## Endpoints

### Listar provedores

```
GET /api/payment-providers
Authorization: Bearer {token}
```

**Query parameters:**
- `is_active` (boolean, opcional) — filtrar apenas ativos/inativos

**Resposta 200:**
```json
{
  "type": "success",
  "message": "Lista paginada de provedores",
  "body": {
    "data": [
      {
        "id": 1,
        "tenant_id": 1,
        "name": "Banco do Brasil",
        "slug": "banco_brasil",
        "description": "Boletos via Banco do Brasil",
        "logo_url": "https://cdn.example.com/banco-brasil-logo.png",
        "is_active": true,
        "order": 1,
        "created_at": "2026-05-15T10:00:00.000000Z",
        "updated_at": "2026-05-15T10:00:00.000000Z"
      },
      {
        "id": 2,
        "tenant_id": 1,
        "name": "PIX",
        "slug": "pix",
        "description": "Pagamento instantâneo PIX",
        "logo_url": "https://cdn.example.com/pix-logo.png",
        "is_active": true,
        "order": 0,
        "created_at": "2026-05-15T10:00:00.000000Z",
        "updated_at": "2026-05-15T10:00:00.000000Z"
      }
    ],
    "links": {
      "first": "http://localhost:4000/api/payment-providers?page=1",
      "last": "http://localhost:4000/api/payment-providers?page=1",
      "prev": null,
      "next": null
    },
    "meta": {
      "current_page": 1,
      "from": 1,
      "last_page": 1,
      "path": "http://localhost:4000/api/payment-providers",
      "per_page": 50,
      "to": 2,
      "total": 2
    }
  }
}
```

---

### Criar provedor

```
POST /api/payment-providers
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Itaú",
  "slug": "itau",
  "description": "Boletos via Banco Itaú",
  "logo_url": "https://cdn.example.com/itau-logo.png",
  "is_active": true,
  "order": 2
}
```

**Campos:**
- `name` — string, obrigatório, máx 255 caracteres
- `slug` — string, obrigatório, único, máx 100 caracteres (sem espaços)
- `description` — string, opcional, máx 1000 caracteres
- `logo_url` — string, opcional, deve ser URL válida
- `is_active` — boolean, opcional (padrão: true)
- `order` — integer, opcional, para ordenação na UI (padrão: 0)

**Resposta 201:**
```json
{
  "type": "success",
  "message": "Provedor de pagamento criado com sucesso.",
  "body": {
    "id": 3,
    "tenant_id": 1,
    "name": "Itaú",
    "slug": "itau",
    "description": "Boletos via Banco Itaú",
    "logo_url": "https://cdn.example.com/itau-logo.png",
    "is_active": true,
    "order": 2,
    "created_at": "2026-05-15T10:30:00.000000Z",
    "updated_at": "2026-05-15T10:30:00.000000Z"
  }
}
```

**Erros possíveis:**
- 422 — slug já existe ou dados inválidos
- 403 — sem permissão (não é admin ou não pertence ao tenant)

---

### Exibir provedor

```
GET /api/payment-providers/{id}
Authorization: Bearer {token}
```

**Resposta 200:**
```json
{
  "type": "success",
  "message": "Provedor de pagamento recuperado com sucesso.",
  "body": {
    "id": 1,
    "tenant_id": 1,
    "name": "Banco do Brasil",
    "slug": "banco_brasil",
    "description": "Boletos via Banco do Brasil",
    "logo_url": "https://cdn.example.com/banco-brasil-logo.png",
    "is_active": true,
    "order": 1,
    "created_at": "2026-05-15T10:00:00.000000Z",
    "updated_at": "2026-05-15T10:00:00.000000Z"
  }
}
```

---

### Atualizar provedor

```
PUT /api/payment-providers/{id}
Authorization: Bearer {token}
Content-Type: application/json
```

**Body (todos os campos opcionais):**
```json
{
  "name": "Banco do Brasil Atualizado",
  "description": "Nova descrição",
  "logo_url": "https://cdn.example.com/bb-novo-logo.png",
  "is_active": false,
  "order": 5
}
```

**Resposta 200:** igual ao `show`

---

### Remover provedor

```
DELETE /api/payment-providers/{id}
Authorization: Bearer {token}
```

**Resposta 200:**
```json
{
  "type": "success",
  "message": "Provedor de pagamento removido com sucesso.",
  "body": null
}
```

---

## Permissões

- ✅ **Super admin**: acesso total a todos os tenants
- ✅ **Admin**: acesso apenas aos provedores do seu tenant
- ❌ **Aluno**: sem acesso

A tentativa de acesso sem permissão retorna **403 Forbidden**.

---

## Casos de uso

### 1. Carregar lista de provedores disponíveis para exibir na UI

```bash
curl -H "Authorization: Bearer {token}" \
     "http://localhost:4000/api/payment-providers?is_active=true"
```

Usa `order` para ordenar na UI (menor order = mais acima).

### 2. Adicionar novo provedor (ex: novo banco)

Admin cadastra via formulário → POST com dados → recebe ID do novo provedor.

### 3. Atualizar logo/dados

```bash
curl -X PUT -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{"logo_url": "https://new-url.png"}' \
     "http://localhost:4000/api/payment-providers/1"
```

### 4. Desabilitar provedor (sem deletar)

```bash
curl -X PUT -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{"is_active": false}' \
     "http://localhost:4000/api/payment-providers/1"
```

---

## Notas

- O slug é único globalmente (não por tenant) — use convenção: `banco_nome`, `pix_provider`, `credito_xyz`
- Soft-delete habilitado — provedores deletados podem ser restaurados se necessário
- `order` pode ser negativo ou grandes valores — use para controlar sequência na UI
- `logo_url` deve ser URL completa e acessível (CDN recomendado)
- Nenhum validação obriga que cobranças existentes usem um provedor específico — é apenas referência para UI
