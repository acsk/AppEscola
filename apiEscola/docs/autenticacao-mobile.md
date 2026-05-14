# Autenticação – Guia de Integração Mobile (React Native)

Cobre o fluxo completo de autenticação para os três perfis de usuário do app: **Aluno**, **Professor** e **Admin**.

---

## Visão geral

A API usa **Laravel Sanctum** com tokens Bearer. Não há sessão — cada requisição autenticada deve enviar o token no header `Authorization`.

```
POST /api/login  →  recebe token
Authorization: Bearer {token}  →  usado em todas as rotas protegidas
POST /api/logout  →  invalida o token
```

---

## Perfis de usuário (`role`)

| `role` | Como faz login | Quem é |
|---|---|---|
| `admin` | E-mail + senha | Diretor, coordenador, secretaria |
| `professor` | E-mail + senha | Professor (a ser implementado no backend) |
| `aluno` | Número de matrícula + senha | Aluno |
| `super_admin` | E-mail + senha | Administrador da plataforma — **não expor no app mobile** |

> **Atenção:** o role `professor` ainda não está criado no backend. Quando o backend liberar, o fluxo de login será idêntico ao `admin` (por e-mail). O frontend já pode preparar a navegação para recebê-lo.

---

## 1. Login

```
POST /api/login
Content-Type: application/json
```

### Campo `login`

A API identifica o tipo de usuário automaticamente pelo formato do campo `login`:

| Formato enviado | Identifica como |
|---|---|
| Contém `@` (e-mail) | Admin / Professor |
| Sem `@` (matrícula) | Aluno |

### Body — Admin ou Professor

```json
{
  "login": "admin@escola.com.br",
  "password": "suasenha"
}
```

### Body — Aluno

```json
{
  "login": "MAT-1-00001",
  "password": "suasenha"
}
```

### Resposta `200` — Login bem-sucedido

```json
{
  "token": "1|abc123...",
  "password_change_required": false,
  "user": {
    "id": 2,
    "tenant_id": 1,
    "name": "Admin Escola",
    "email": "admin@escola.com.br",
    "role": "admin",
    "status": "active",
    "password_change_required": false,
    "email_verified_at": "2026-05-01T10:00:00.000Z",
    "created_at": "2026-05-01T10:00:00.000Z",
    "updated_at": "2026-05-01T10:00:00.000Z"
  }
}
```

### Respostas de erro

| Código | Motivo | Mensagem |
|---|---|---|
| `422` | Credenciais inválidas | `{ "errors": { "login": ["Credenciais inválidas."] } }` |
| `403` | Usuário inativo | `{ "message": "Usuário inativo." }` |

---

## 2. Armazenar o token (React Native)

Use `expo-secure-store` (Expo) ou `@react-native-async-storage/async-storage` com criptografia. **Nunca armazene o token em `AsyncStorage` sem criptografia.**

```ts
import * as SecureStore from 'expo-secure-store';

// Salvar após login
await SecureStore.setItemAsync('auth_token', response.token);
await SecureStore.setItemAsync('user_role', response.user.role);
await SecureStore.setItemAsync('user_data', JSON.stringify(response.user));

// Ler nas próximas requisições
const token = await SecureStore.getItemAsync('auth_token');

// Limpar no logout
await SecureStore.deleteItemAsync('auth_token');
await SecureStore.deleteItemAsync('user_role');
await SecureStore.deleteItemAsync('user_data');
```

---

## 3. Enviar o token em todas as requisições

Adicione o header em todas as chamadas autenticadas:

```ts
const api = axios.create({
  baseURL: 'https://api.suaescola.com.br',
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

---

## 4. Verificar usuário autenticado (`/me`)

Use após o app iniciar para validar se o token salvo ainda é válido:

```
GET /api/me
Authorization: Bearer {token}
```

### Resposta `200`

```json
{
  "id": 2,
  "tenant_id": 1,
  "name": "Admin Escola",
  "email": "admin@escola.com.br",
  "role": "admin",
  "status": "active",
  "password_change_required": false
}
```

| Código | Ação |
|---|---|
| `200` | Token válido — prosseguir para a tela principal |
| `401` | Token expirado ou inválido — redirecionar para login |

---

## 5. Logout

```
POST /api/logout
Authorization: Bearer {token}
```

Invalida o token atual no servidor. Após a chamada, apagar o token localmente:

### Resposta `200`

```json
{ "message": "Logout realizado com sucesso." }
```

---

## 6. Navegação por perfil (`role`)

Após o login, leia `user.role` para definir qual stack de navegação renderizar:

```ts
function RootNavigator() {
  const role = user?.role;

  if (!role) return <AuthStack />;       // não autenticado

  switch (role) {
    case 'admin':
    case 'super_admin':
      return <AdminStack />;

    case 'professor':
      return <ProfessorStack />;

    case 'aluno':
      return <AlunoStack />;

    default:
      return <AuthStack />;              // role desconhecido → logout
  }
}
```

### Telas sugeridas por perfil

| Stack | Telas principais |
|---|---|
| `AdminStack` | Dashboard, Alunos, Professores, Turmas, Simulados, Relatórios |
| `ProfessorStack` | Minhas turmas, Conteúdos, Simulados, Notas |
| `AlunoStack` | Início, Simulados, Minhas notas, Horários |

---

## 7. Troca de senha obrigatória

Se o campo `password_change_required: true` vier na resposta do login, redirecione o usuário para a tela de troca de senha **antes** de liberar o app:

```ts
const { token, user, password_change_required } = response.data;

await SecureStore.setItemAsync('auth_token', token);

if (password_change_required) {
  navigation.replace('ChangePassword');
} else {
  navigation.replace(getStackForRole(user.role));
}
```

> O endpoint de troca de senha deve ser confirmado com o backend — verificar se já existe `POST /api/me/password` ou similar.

---

## 8. Fluxo completo resumido

```
App inicia
  → tem token salvo?
      não → tela de Login
      sim → GET /api/me
              401 → apagar token → tela de Login
              200 → role?
                      admin/super_admin → AdminStack
                      professor        → ProfessorStack
                      aluno            → AlunoStack

Tela de Login
  → usuário digita login (e-mail ou matrícula) + senha
  → POST /api/login
      422/403 → exibir erro
      200     → salvar token + role
              → password_change_required?
                  sim → ChangePassword
                  não → stack do perfil

Logout
  → POST /api/logout
  → apagar token local
  → redirecionar para Login
```

---

## 9. Tratamento global de erros de autenticação

Intercepte respostas `401` globalmente para fazer logout automático quando o token expirar:

```ts
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_role');
      // navegar para Login — use um ref de navegação global
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
    return Promise.reject(error);
  }
);
```

---

## 10. Force Relogin — sessão forçada pelo servidor

A API pode sinalizar que todos os usuários devem deslogar e logar novamente (ex.: após mudança de estrutura de token, migração de dados ou break de contrato).

### Como funciona

Todo response da API inclui o header:

```
X-Force-Relogin: false   ← valor normal
X-Force-Relogin: true    ← ação requerida: deslogar
```

O valor também está disponível no endpoint público `GET /api/meta` no campo `force_relogin`.

### Como ativar (lado servidor)

No arquivo `.env` da API, defina:

```env
API_FORCE_RELOGIN=true
```

Depois execute `php artisan config:clear`. Quando o problema for resolvido, volte para `false` e limpe o cache novamente.

### Implementação no interceptor (React Native)

Atualize o interceptor do item 9 para também verificar o header:

```ts
api.interceptors.response.use(
  (response) => {
    const forceRelogin = response.headers['x-force-relogin'];
    if (forceRelogin === 'true') {
      SecureStore.deleteItemAsync('auth_token');
      SecureStore.deleteItemAsync('user_role');
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_role');
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
    return Promise.reject(error);
  }
);
```

> **Atenção:** lembre de incluir `x-force-relogin` nos headers expostos no CORS (`Access-Control-Expose-Headers`) se o app for web/PWA.

