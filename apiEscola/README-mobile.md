# API AppEscola — Guia de Integração Mobile

> **Plataforma:** Laravel 12 + Sanctum · **Auth:** Bearer Token  
> **Base URL (dev):** `http://localhost:4000/api`

---

## Índice

1. [Autenticação](#1-autenticação)
2. [Formato padrão de resposta](#2-formato-padrão-de-resposta)
3. [Simulados — Aluno](#3-simulados--aluno)
4. [Fluxo de realização de simulado](#4-fluxo-de-realização-de-simulado)
5. [Troca de senha](#5-troca-de-senha)
6. [Navegação por perfil (role)](#6-navegação-por-perfil-role)
7. [Erros comuns](#7-erros-comuns)

---

## 1. Autenticação

### Login

```
POST /api/login
Content-Type: application/json
```

| Campo | Tipo | Descrição |
|---|---|---|
| `login` | string | E-mail (admin/professor) ou número de matrícula (aluno) |
| `password` | string | Senha |

**Exemplos de body:**

```json
// Admin ou Professor
{ "login": "admin@escola.com.br", "password": "suasenha" }

// Aluno
{ "login": "MAT-1-00001", "password": "suasenha" }
```

**Resposta `200`:**

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": {
    "token": "1|abc123...",
    "password_change_required": false,
    "user": {
      "id": 2,
      "tenant_id": 1,
      "name": "Admin Escola",
      "email": "admin@escola.com.br",
      "role": "admin",
      "status": "active",
      "password_change_required": false
    }
  }
}
```

> **Atenção:** se `password_change_required: true`, redirecione imediatamente para a tela de troca de senha antes de liberar o app.

---

### Usar o token

Adicione em **todas** as requisições autenticadas:

```
Authorization: Bearer {token}
```

---

### Obter usuário autenticado

```
GET /api/me
Authorization: Bearer {token}
```

Use ao iniciar o app para validar se o token ainda é válido.  
`401` = token expirado → redirecionar para Login.

---

### Logout

```
POST /api/logout
Authorization: Bearer {token}
```

Invalida o token no servidor. Após a chamada, apague o token localmente.

---

## 2. Formato padrão de resposta

Todas as respostas seguem este envelope:

```json
{
  "type": "success" | "error",
  "message": "Descrição da operação",
  "body": { ... } | null
}
```

| `type` | HTTP | Situação |
|---|---|---|
| `success` | 200 | Operação bem-sucedida |
| `success` | 201 | Recurso criado |
| `error` | 400 | Erro genérico |
| `error` | 403 | Sem permissão / matrícula inativa |
| `error` | 404 | Recurso não encontrado |
| `error` | 422 | Dados inválidos — `body.errors` contém os detalhes |

**Exemplo de erro de validação:**

```json
{
  "type": "error",
  "message": "Dados inválidos.",
  "body": {
    "errors": {
      "login": ["Credenciais inválidas."]
    }
  }
}
```

---

## 3. Simulados — Aluno

> Estes endpoints são exclusivos para usuários com `role: "aluno"`.  
> Critérios verificados automaticamente:
> - Aluno com `status: active`
> - Matrícula `status: active` dentro do período (start_date ≤ hoje ≤ end_date)
> - Simulado publicado (`status: published`)
> - Simulado do curso da matrícula ativa
> - Prazo não encerrado (`ends_at >= agora` ou sem data)

---

### Listar simulados disponíveis

```
GET /api/aluno/exams
Authorization: Bearer {token}
```

**Resposta `200`:**

```json
{
  "type": "success",
  "message": "Simulados disponíveis.",
  "body": [
    {
      "id": 2,
      "course_id": 4,
      "course": { "id": 4, "name": "CPM - PORT/MAT" },
      "subject_id": 2,
      "subject": {
        "id": 2,
        "name": "Português",
        "icon": "book-open",
        "color": "#10B981"
      },
      "exam_type": "enem",
      "exam_type_label": "ENEM",
      "status": "published",
      "status_label": "Publicado",
      "title": "Simulado ENEM 2026 – Matemática e Linguagens",
      "description": "...",
      "duration_minutes": 90,
      "passing_score": 60.0,
      "starts_at": "2026-05-03T00:00:00.000000Z",
      "ends_at": "2026-05-09T00:00:00.000000Z",
      "attempt_status": "not_started",
      "can_start": true
    }
  ]
}
```

| Campo | Valores possíveis | Descrição |
|---|---|---|
| `attempt_status` | `not_started` \| `in_progress` \| `completed` | Status da tentativa do aluno |
| `can_start` | `true` \| `false` | Se está dentro do período permitido para iniciar |

---

### Detalhes de um simulado (com questões)

```
GET /api/aluno/exams/{id}
Authorization: Bearer {token}
```

Retorna o simulado com as questões e opções. Não exibe o gabarito.

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": {
    "id": 2,
    "subject": {
      "id": 2,
      "name": "Português",
      "icon": "book-open",
      "color": "#10B981"
    },
    "title": "Simulado ENEM 2026",
    "attempt_status": "not_started",
    "attempt_id": null,
    "can_start": true,
    "questions": [
      {
        "id": 1,
        "type": "multiple_choice",
        "question_text": "Qual é o valor de x?",
        "image_url": null,
        "points": 1,
        "order": 1,
        "allow_text_answer": false,
        "options": [
          { "id": 1, "option_text": "x = 0", "order": 1, "triggers_text_input": false },
          { "id": 2, "option_text": "x = 4", "order": 2, "triggers_text_input": false },
          { "id": 3, "option_text": "Outro", "order": 3, "triggers_text_input": true }
        ]
      },
      {
        "id": 2,
        "type": "essay",
        "question_text": "Disserte sobre...",
        "options": []
      }
    ]
  }
}
```

---

## 4. Fluxo de realização de simulado

```
Listar simulados  →  Selecionar  →  Iniciar  →  Responder (loop)  →  Finalizar
GET /aluno/exams     GET /aluno/exams/{id}   POST /exams/{id}/start   POST /exam-attempts/{id}/answer   POST /exam-attempts/{id}/finish
```

---

### Passo 1 — Iniciar tentativa

```
POST /api/exams/{exam_id}/start
Authorization: Bearer {token}
```

> Para alunos, **não é necessário enviar body**. O `student_id` é resolvido automaticamente pelo token.  
> Para admin/professor, enviar `{ "student_id": 5 }` no body.

**Resposta `201`:**

```json
{
  "type": "success",
  "message": "Criado com sucesso.",
  "body": {
    "id": 42,
    "exam_id": 2,
    "student_id": 11,
    "status": "in_progress",
    "started_at": "2026-05-03T20:00:00.000000Z",
    "exam": { "id": 2, "title": "Simulado ENEM 2026" }
  }
}
```

> Guarde o `id` retornado (é o `attempt_id`) para os próximos passos.

**Bloqueios automáticos:**
- Simulado não publicado → `422`
- Tentativa já em andamento → `422` (erro em `exam_id`)
- Antes de `starts_at` → `422`
- Após `ends_at` → `422`

---

### Passo 2 — Enviar resposta

```
POST /api/exam-attempts/{attempt_id}/answer
Authorization: Bearer {token}
Content-Type: application/json
```

**Questão objetiva (opção normal):**
```json
{ "question_id": 1, "option_id": 2 }
```

**Questão objetiva com opção "Outro" (`triggers_text_input: true`):**
```json
{ "question_id": 1, "option_id": 3, "text_answer": "Minha resposta livre" }
```

**Questão objetiva com justificativa obrigatória (`allow_text_answer: true`):**
```json
{ "question_id": 1, "option_id": 2, "text_answer": "Justificativa aqui" }
```

**Questão discursiva (`type: essay`):**
```json
{ "question_id": 9, "text_answer": "Desenvolvimento da resposta..." }
```

Pode ser chamado múltiplas vezes — cada chamada **substitui** a resposta anterior da mesma questão.

---

### Passo 3 — Finalizar simulado

```
POST /api/exam-attempts/{attempt_id}/finish
Authorization: Bearer {token}
```

**Resposta `200`:**

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": {
    "id": 42,
    "status": "completed",
    "score": 8.0,
    "max_score": 10.0,
    "percentage": 80.0,
    "passed": true,
    "finished_at": "2026-05-03T21:30:00.000000Z"
  }
}
```

| Campo | Descrição |
|---|---|
| `score` | Pontuação obtida |
| `max_score` | Pontuação máxima possível |
| `percentage` | `score / max_score * 100` |
| `passed` | `true` se `percentage >= passing_score` do simulado |

> Questões discursivas (`essay`) ficam com `is_correct: null` e `points_earned: 0` até correção manual.

---

## 5. Troca de senha

```
POST /api/me/password
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "current_password": "senhaAtual",
  "password": "novaSenha123",
  "password_confirmation": "novaSenha123"
}
```

**Regras:**
- Nova senha: mínimo 8 caracteres
- Após sucesso, `password_change_required` é definido como `false` automaticamente

---

## 6. Navegação por perfil (role)

Após o login, use `user.role` para definir a navegação:

| `role` | Stack | Como faz login |
|---|---|---|
| `admin` | AdminStack | E-mail |
| `professor` | ProfessorStack | E-mail *(a ser liberado pelo backend)* |
| `aluno` | AlunoStack | Número de matrícula |
| `super_admin` | Não expor no app | E-mail |

**Fluxo de inicialização do app:**

```
App inicia
  └─ tem token salvo?
       não → tela de Login
       sim → GET /api/me
               401 → apagar token → Login
               200 → role?
                       admin  → AdminStack
                       aluno  → AlunoStack
                       ...
               200 + password_change_required: true → ChangePassword
```

---

## 7. Erros comuns

| Código | Causa | Ação |
|---|---|---|
| `401` | Token ausente ou expirado | Apagar token e redirecionar para Login |
| `403` | Matrícula inativa, aluno inativo ou tenant errado | Exibir mensagem de `body.message` |
| `404` | Simulado não encontrado ou sem acesso | Exibir tela de erro |
| `422` | Dados inválidos ou regra de negócio | Exibir `body.errors` no formulário |

**Interceptor global recomendado (Axios):**

```ts
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
    return Promise.reject(error);
  }
);
```
