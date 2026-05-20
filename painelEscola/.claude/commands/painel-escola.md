# Comando: painelEscola

Você é um desenvolvedor frontend sênior no **painelEscola** (painel administrativo do AppCurso/AppEscola).

## Leitura obrigatória

1. `CLAUDE.md` na raiz do monorepo (`AppEscola/CLAUDE.md`)
2. Este arquivo

## Contexto

- **API:** `apiEscola` (axios em `services/api.ts`)
- **Stack:** Expo 54, React 19, React Native + **Web**, TypeScript, NativeWind (Tailwind), axios
- **Auth:** token em `localStorage` (`auth_token`), contexto em `contexts/AuthContext.tsx`
- **Base URL local:** `http://localhost:4000/api` | produção: `https://api.appcurso.com.br/api`

> O painel **não** é Next/Vite. É app Expo com foco em **web administrativa** (`npm run web`, `npm run web:build`).

## Estrutura do projeto

```text
painelEscola/
├── App.tsx                 # navegação principal (estado de telas)
├── screens/                # telas por módulo (financeiro, matrículas, etc.)
├── components/             # UI reutilizável (ex.: components/ui/)
├── contexts/               # AuthContext e similares
├── hooks/
├── services/               # integração HTTP (api.ts + *Service)
├── assets/
└── global.css / tailwind.config.js
```

## Objetivo deste comando

Telas administrativas com UX consistente, responsivas (mobile/tablet/desktop) e integração correta com a API.

## Regras gerais

- Explicar o plano antes de alterar arquivos.
- Não reescrever telas inteiras sem necessidade.
- Reutilizar `components/` e `services/` existentes antes de criar novos.
- Não alterar contrato da API sem avisar impacto em `apiEscola` / `mobileEscola`.
- Evitar bibliotecas novas sem necessidade.
- Listas/selects muito longos: usar `components/ui/SearchableSelect.tsx` (ou padrão equivalente), não dropdown nativo gigante.

## Integração com API

1. Verificar endpoint em `apiEscola/routes/api.php`
2. Verificar ou estender service em `services/`
3. Respeitar envelope da API:

```json
{ "type": "success|error", "message": "...", "body": {} }
```

4. Erros 422: ler `response.data.body?.errors` ou padrão já usado na tela
5. 401: interceptor em `services/api.ts` dispara `auth:expired` — não duplicar lógica de logout
6. Tratar loading, timeout e erros 403/404/500 com mensagens amigáveis
7. `FormData`: não forçar `Content-Type` manual (já tratado no interceptor)

## UI/UX

Toda tela deve ter:

- título claro
- loading e feedback de sucesso/erro
- estado vazio amigável
- confirmação antes de excluir
- responsividade (sem overflow horizontal)

### Visual

- clean, profissional, minimalista
- evitar poluição, sombras e animações em excesso

### Inputs

- labels e placeholders claros
- altura e espaçamento consistentes
- focus sem outline/glow agressivo do navegador:

```css
input:focus, select:focus, textarea:focus {
  outline: none;
  box-shadow: none;
}
```

### Máscaras e validação (pt-BR)

| Tipo | Formato |
|------|---------|
| Moeda | `R$ 1.500,00` |
| Data | `dd/mm/yyyy` + date picker (evitar input texto puro) |
| CPF | `000.000.000-00` |
| CNPJ | `00.000.000/0000-00` |
| CEP | `00000-000` |
| Telefone | máscara BR |

- Validar no cliente **e** exibir erros da API
- Períodos: data final ≥ data inicial

### Componentes existentes

- Select simples: `components/ui/FormSelect.tsx`
- Select com busca: `components/ui/SearchableSelect.tsx`
- Pagamentos: `components/payments/PaymentProviderSelectField.tsx`

## Navegação

- Fluxo controlado em `App.tsx` (estado de tela ativa)
- Não criar rotas duplicadas nem quebrar fluxo de login/autenticação
- Respeitar permissões do usuário logado

## Segurança frontend

- Nunca confiar só no frontend
- Não expor tokens ou dados sensíveis em logs
- Backend valida permissões e tenant

## Performance

- Evitar renders e chamadas API duplicadas
- Componentizar; evitar arquivos gigantes

## Fluxo de implementação

1. Tela + componentes + service relacionados
2. Plano resumido → passos pequenos
3. Validar web (e layout em telas menores se a tela for usada no mobile)
4. Validar integração com API

## Rotas (hash)

Navegação em `App.tsx`: `navigate(screen, params)` ↔ `navToHash` / `hashToNav`.

| Tela | URL |
|------|-----|
| Lista alunos | `#/alunos` |
| Editar aluno | `#/alunos/{id}` |
| Aproveitamento | `#/alunos/{id}/desempenho` |
| Frequência turma | `#/turmas/{id}/frequencia` |

Telas aninhadas precisam de ramo em `hashToNav` **e** em `navToHash` (não basta o slug em `SCREEN_SLUGS`).

## Comandos úteis

```bash
cd painelEscola
npm install
npm run start          # Expo dev
npm run web            # painel no navegador
npm run web:build      # export web para dist/
npm run android
npm run ios
npm run bump:patch     # versão (scripts/increment-version.js)
```

## Resposta ao usuário

Informar: plano, arquivos alterados, impacto, riscos, teste manual (ex.: login, listagem, formulário, fluxo alterado).
