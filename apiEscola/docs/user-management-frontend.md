# Gestão de Usuários (Frontend)

Este documento descreve como o frontend deve consumir o módulo de administração de usuários.

## Perfis com acesso

- `super_admin`: gerencia usuários globais e de qualquer tenant.
- `admin`: gerencia usuários apenas do próprio tenant.
- Demais perfis recebem `403`.

## Base URL

- Produção: `https://api.appcurso.com.br/api`

## Autenticação

Todas as rotas exigem Bearer Token (Sanctum):

```http
Authorization: Bearer {token}
Accept: application/json
Content-Type: application/json
```

## Regras de escopo

- `super_admin`:
  - pode listar todos os usuários;
  - pode filtrar por `tenant_id`;
  - pode criar/editar usuário `super_admin` (sempre com `tenant_id = null`);
  - pode criar/editar usuários de tenant informando `tenant_id`.
- `admin`:
  - lista e gerencia apenas usuários do próprio tenant;
  - não pode criar/editar usuários com role `super_admin`;
  - `tenant_id` é sempre forçado para o tenant do usuário autenticado.

## Professor x disciplinas

- O vínculo professor-disciplinas é feito pelo campo `subject_ids` no create/update de usuário.
- Apenas usuários com role `professor` podem ter disciplinas vinculadas.
- As disciplinas informadas em `subject_ids` devem pertencer ao mesmo tenant do professor.
- Se um usuário deixar de ser `professor`, os vínculos com disciplinas são removidos automaticamente.

## Endpoints

### 1) Listar usuários

- Método: `GET`
- URL: `/users`
- Query params opcionais:
  - `tenant_id` (apenas super_admin)
  - `role`
  - `status`
  - `search` (nome ou email)

Exemplo:

```http
GET /api/users?tenant_id=3&role=professor&status=active&search=maria
```

Resposta `200` (resumida):

```json
{
  "data": [
    {
      "id": 21,
      "tenant_id": 3,
      "name": "Maria Oliveira",
      "email": "maria@tenant.com",
      "role": "professor",
      "status": "active",
      "password_change_required": false,
      "email_verified_at": null,
      "created_at": "2026-05-06T10:00:00.000000Z",
      "updated_at": "2026-05-06T10:00:00.000000Z"
    }
  ],
  "links": {},
  "meta": {}
}
```

### 2) Criar usuário

- Método: `POST`
- URL: `/users`

Payload base:

```json
{
  "tenant_id": 3,
  "name": "Novo Usuário",
  "email": "novo@tenant.com",
  "password": "12345678",
  "password_confirmation": "12345678",
  "role": "secretaria",
  "status": "active",
  "password_change_required": true,
  "subject_ids": [1, 2, 5]
}
```

Regras:

- `email` deve ser único em toda tabela de usuários.
- `password` mínimo de 6 caracteres e com confirmação.
- Para `role = super_admin`, o backend salva `tenant_id = null`.
- Para qualquer role diferente de `super_admin`, `tenant_id` é obrigatório para super_admin e forçado automaticamente para admin de tenant.
- `subject_ids` é opcional.
- Quando informado com role `professor`, o backend sincroniza as disciplinas do professor.
- Se informar `subject_ids` para role diferente de `professor`, a API retorna `422`.

Resposta `201`:

```json
{
  "type": "success",
  "message": "Criado com sucesso.",
  "body": {
    "id": 22,
    "tenant_id": 3,
    "name": "Novo Usuário",
    "email": "novo@tenant.com",
    "role": "secretaria",
    "status": "active",
    "password_change_required": true,
    "subject_ids": [],
    "subjects": [],
    "email_verified_at": null,
    "created_at": "2026-05-06T10:05:00.000000Z",
    "updated_at": "2026-05-06T10:05:00.000000Z"
  }
}
```

### 3) Exibir usuário

- Método: `GET`
- URL: `/users/{id}`

Resposta `200`:

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": {
    "id": 22,
    "tenant_id": 3,
    "name": "Novo Usuário",
    "email": "novo@tenant.com",
    "role": "secretaria",
    "status": "active",
    "password_change_required": true,
    "subject_ids": [],
    "subjects": [],
    "email_verified_at": null,
    "created_at": "2026-05-06T10:05:00.000000Z",
    "updated_at": "2026-05-06T10:05:00.000000Z"
  }
}
```

### 4) Atualizar usuário

- Método: `PUT`
- URL: `/users/{id}`

Payload parcial (exemplo):

```json
{
  "name": "Novo Nome",
  "status": "inactive",
  "password_change_required": true,
  "subject_ids": [3, 4]
}
```

Exemplo alterando senha:

```json
{
  "password": "NovaSenha@123",
  "password_confirmation": "NovaSenha@123"
}
```

Regras:

- `admin` não pode alterar `tenant_id` e não pode promover para `super_admin`.
- `super_admin` pode mover usuário de tenant alterando `tenant_id`.
- Usuário administrador inicial criado junto com o tenant não pode ter `role` alterada (`422`).
- Se o usuário ficar com role diferente de `super_admin`, o `tenant_id` não pode ficar nulo.
- `subject_ids` substitui a lista completa de disciplinas do professor.
- Para limpar todas as disciplinas de um professor, enviar `subject_ids: []`.

Resposta `200`: usuário atualizado.

### 5) Remover usuário

- Método: `DELETE`
- URL: `/users/{id}`

Regras:

- Não é permitido remover o próprio usuário autenticado (`422`).
- Usuário administrador inicial criado junto com o tenant não pode ser removido (`422`).
- `admin` só remove usuários do próprio tenant.

Resposta `200`:

```json
{
  "message": "Usuário removido com sucesso."
}
```

## Tratamento de erros no frontend

### `401 Não autenticado`

- Token ausente, expirado ou inválido.

### `403 Acesso negado`

- Perfil sem permissão ou tentativa de acessar usuário fora do escopo do tenant.

### `422 Dados inválidos`

Estrutura padrão:

```json
{
  "message": "Dados inválidos.",
  "errors": {
    "email": ["O email já está em uso."],
    "password": ["O campo password confirmação não confere."]
  }
}
```

## Campos sugeridos de formulário

Create/Edit:

- tenant_id (apenas para super_admin quando role != super_admin)
- name
- email
- role
- status
- password
- password_confirmation
- password_change_required
- subject_ids (apenas para professor)
