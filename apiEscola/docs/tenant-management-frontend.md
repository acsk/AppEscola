# Gestão de Tenants (Frontend)

Este documento descreve como o frontend deve consumir o módulo de gestão de tenants.

## Regras de acesso

- Apenas usuários com `role = super_admin` podem acessar as rotas de tenants.
- Se um usuário sem permissão tentar acessar, a API retorna `403`.

## Base URL

- Produção: `https://api.appcurso.com.br/api`

## Autenticação

- Todas as rotas abaixo exigem Bearer Token (Sanctum).
- Header obrigatório:

```http
Authorization: Bearer {token}
Accept: application/json
Content-Type: application/json
```

## Endpoints

### 1) Listar tenants

- Método: `GET`
- URL: `/tenants`
- Query params opcionais:
  - `status` (string)
  - `search` (string)

Exemplo:

```http
GET /api/tenants?status=active&search=curso
```

Resposta `200` (resumida):

```json
{
  "data": [
    {
      "id": 1,
      "corporate_name": "Escola Exemplo LTDA",
      "trade_name": "Escola Exemplo",
      "name": "Escola Exemplo",
      "slug": "escola-exemplo",
      "cnpj": "12.345.678/0001-99",
      "email": "contato@escola.com",
      "phone": "(11) 3000-0000",
      "whatsapp": "(11) 90000-0000",
      "address": {
        "zip_code": "01000-000",
        "street": "Rua A",
        "number": "100",
        "complement": null,
        "neighborhood": "Centro",
        "city": "São Paulo",
        "state": "SP"
      },
      "status": "active",
      "settings": null,
      "created_at": "2026-05-05T23:00:00.000000Z",
      "updated_at": "2026-05-05T23:00:00.000000Z"
    }
  ],
  "links": {},
  "meta": {}
}
```

### 2) Criar tenant + usuário admin do tenant

- Método: `POST`
- URL: `/tenants`

Payload obrigatório:

```json
{
  "corporate_name": "Escola Exemplo LTDA",
  "name": "Escola Exemplo",
  "slug": "escola-exemplo",
  "admin_name": "Admin Escola",
  "admin_email": "admin@escolaexemplo.com.br",
  "admin_password": "12345678",
  "admin_password_confirmation": "12345678"
}
```

Payload completo (campos opcionais incluídos):

```json
{
  "corporate_name": "Escola Exemplo LTDA",
  "trade_name": "Escola Exemplo",
  "name": "Escola Exemplo",
  "slug": "escola-exemplo",
  "cnpj": "12.345.678/0001-99",
  "email": "contato@escolaexemplo.com.br",
  "phone": "(11) 3000-0000",
  "whatsapp": "(11) 90000-0000",
  "zip_code": "01000-000",
  "street": "Rua A",
  "number": "100",
  "complement": "Sala 1",
  "neighborhood": "Centro",
  "city": "São Paulo",
  "state": "SP",
  "status": "active",
  "settings": {
    "timezone": "America/Sao_Paulo"
  },
  "admin_name": "Admin Escola",
  "admin_email": "admin@escolaexemplo.com.br",
  "admin_password": "12345678",
  "admin_password_confirmation": "12345678"
}
```

Payload completo (alternativo com `address` aninhado):

```json
{
  "corporate_name": "Escola Exemplo LTDA",
  "trade_name": "Escola Exemplo",
  "name": "Escola Exemplo",
  "slug": "escola-exemplo",
  "cnpj": "12.345.678/0001-99",
  "email": "contato@escolaexemplo.com.br",
  "phone": "(11) 3000-0000",
  "whatsapp": "(11) 90000-0000",
  "address": {
    "zip_code": "01000-000",
    "street": "Rua A",
    "number": "100",
    "complement": "Sala 1",
    "neighborhood": "Centro",
    "city": "São Paulo",
    "state": "SP"
  },
  "status": "active",
  "settings": {
    "timezone": "America/Sao_Paulo"
  },
  "admin_name": "Admin Escola",
  "admin_email": "admin@escolaexemplo.com.br",
  "admin_password": "12345678",
  "admin_password_confirmation": "12345678"
}
```

Regras importantes no create:

- `admin_email` deve ser único na tabela de usuários.
- `admin_password` mínimo de 6 caracteres.
- `admin_password_confirmation` deve ser idêntico ao `admin_password`.
- O backend aceita endereço no formato plano (`zip_code`, `street`, etc.) ou em `address` aninhado.
- A criação é transacional: tenant e usuário admin são criados juntos.
- O usuário criado automaticamente terá:
  - `role = admin`
  - `status = active`
  - `password_change_required = true`

Resposta `201`:

```json
{
  "data": {
    "id": 10,
    "corporate_name": "Escola Exemplo LTDA",
    "trade_name": "Escola Exemplo",
    "name": "Escola Exemplo",
    "slug": "escola-exemplo",
    "cnpj": "12.345.678/0001-99",
    "email": "contato@escolaexemplo.com.br",
    "phone": "(11) 3000-0000",
    "whatsapp": "(11) 90000-0000",
    "address": {
      "zip_code": "01000-000",
      "street": "Rua A",
      "number": "100",
      "complement": "Sala 1",
      "neighborhood": "Centro",
      "city": "São Paulo",
      "state": "SP"
    },
    "status": "active",
    "settings": {
      "timezone": "America/Sao_Paulo"
    },
    "created_at": "2026-05-05T23:00:00.000000Z",
    "updated_at": "2026-05-05T23:00:00.000000Z"
  }
}
```

### 3) Exibir tenant

- Método: `GET`
- URL: `/tenants/{id}`

Resposta `200`: mesmo formato do item de listagem.

### 4) Atualizar tenant

- Método: `PUT`
- URL: `/tenants/{id}`

- Campos permitidos:
  - Dados do tenant (trade_name, phone, address, status, etc.).
  - Campos opcionais para o admin do tenant:
    - `admin_password`
    - `admin_password_confirmation` (obrigatório quando enviar `admin_password`)
    - `admin_password_change_required` (boolean)

Exemplo:

```json
{
  "trade_name": "Escola Exemplo Atualizada",
  "phone": "(11) 3333-0000",
  "status": "active"
}
```

Exemplo com `address` aninhado:

```json
{
  "trade_name": "Escola Exemplo Atualizada",
  "address": {
    "zip_code": "57300-360",
    "street": "Rua Exemplo",
    "number": "123",
    "complement": "Sala 2",
    "neighborhood": "Centro",
    "city": "Arapiraca",
    "state": "AL"
  },
  "status": "active"
}
```

Exemplo para alterar senha do admin e forçar troca no próximo acesso:

```json
{
  "admin_password": "NovaSenha@123",
  "admin_password_confirmation": "NovaSenha@123",
  "admin_password_change_required": true
}
```

Exemplo para apenas alterar a obrigatoriedade de troca de senha:

```json
{
  "admin_password_change_required": false
}
```

Resposta `200`: tenant atualizado.

Regras importantes no update:

- Se `admin_password` for enviado, mínimo de 6 caracteres e confirmação obrigatória.
- `admin_password_change_required` aceita `true` ou `false`.
- Se o tenant não tiver usuário com `role = admin`, a API retorna `422`.

### 5) Remover tenant

- Método: `DELETE`
- URL: `/tenants/{id}`

Resposta `200`:

```json
{
  "message": "Tenant removido com sucesso."
}
```

## Tratamento de erros no frontend

### `401 Não autenticado`

- Token ausente, expirado ou inválido.
- Ação recomendada: forçar logout e redirecionar para login.

### `403 Acesso permitido apenas para super admin`

- Usuário autenticado sem role `super_admin`.
- Ação recomendada: esconder módulo de tenants e mostrar mensagem de acesso negado.

### `422 Dados inválidos`

Estrutura padrão:

```json
{
  "message": "Dados inválidos.",
  "errors": {
    "admin_email": ["O admin email já está em uso."],
    "admin_password": ["O campo admin password confirmação não confere."]
  }
}
```

- Ação recomendada: mapear `errors` por campo no formulário.

## Campos sugeridos de formulário (Create)

Tenant:

- corporate_name (obrigatório)
- trade_name
- name (obrigatório)
- slug (obrigatório)
- cnpj
- email
- phone
- whatsapp
- zip_code
- street
- number
- complement
- neighborhood
- city
- state
- status

Admin do Tenant:

- admin_name (obrigatório)
- admin_email (obrigatório)
- admin_password (obrigatório)
- admin_password_confirmation (obrigatório)

## Campos sugeridos de formulário (Edit)

Tenant:

- trade_name
- name
- slug
- cnpj
- email
- phone
- whatsapp
- zip_code
- street
- number
- complement
- neighborhood
- city
- state
- status

Admin do Tenant (opcional):

- admin_password
- admin_password_confirmation
- admin_password_change_required (checkbox: exigir troca de senha no primeiro acesso)

## Observação para UX

- Na tela de criação, separar visualmente em dois blocos:
  - Dados do tenant
  - Usuário administrador inicial
- Mostrar aviso após sucesso:
  - "Tenant criado com sucesso. O admin inicial foi criado com obrigatoriedade de troca de senha no primeiro acesso."