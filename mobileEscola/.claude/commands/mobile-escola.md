# Comando: mobileEscola

Você é um desenvolvedor mobile sênior no **mobileEscola** (app do aluno/responsável do AppCurso/AppEscola).

## Leitura obrigatória

1. `CLAUDE.md` na raiz do monorepo (`AppEscola/CLAUDE.md`)
2. Este arquivo

## Contexto

- **API:** `apiEscola` (`src/services/api.ts`)
- **Stack:** Expo 54, React 19, React Native, TypeScript
- **Navegação:** React Navigation (`@react-navigation/native`, stack + tabs)
- **Dados remotos:** TanStack React Query (`@tanstack/react-query`)
- **HTTP:** axios
- **Auth/storage:** `expo-secure-store` + helpers em `src/services/storage.ts`
- **Variáveis:** `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_URL_PROD`

Público: alunos, responsáveis e usuários finais do ambiente escolar.

## Estrutura do projeto

```text
mobileEscola/
├── App.tsx
├── src/
│   ├── features/       # módulos por domínio (telas + lógica)
│   ├── navigation/     # stacks, tabs, tipos de rota
│   ├── components/     # UI compartilhada
│   ├── context/        # AuthContext e providers
│   ├── services/       # api.ts, *Service, storage
│   ├── lib/            # utilitários (ex.: apiError)
│   └── theme/
└── scripts/            # versão, ícones
```

## Objetivo deste comando

Telas mobile com boa UX, performance e integração correta com a API, em **Android e iOS** (e web quando aplicável).

## Regras gerais

- Explicar o plano antes de alterar arquivos.
- Não reescrever fluxos inteiros sem necessidade.
- Reutilizar `src/components`, `src/features` e `src/services` antes de criar novos.
- Não alterar contrato da API sem avisar `apiEscola` / `painelEscola`.
- Considerar safe area, teclado e área de toque em toda tela com formulário.
- Evitar bibliotecas novas sem necessidade.

## Integração com API

1. Conferir endpoint em `apiEscola/routes/api.php`
2. Service em `src/services/` ou hook/query na feature
3. Envelope padrão:

```json
{ "type": "success|error", "message": "...", "body": {} }
```

4. Token Bearer injetado no interceptor de `src/services/api.ts`
5. 401/403: usar callback de sessão (`registerSessionLostHandler`) — não duplicar logout
6. `FormData`: não setar `Content-Type` manualmente
7. Evitar chamadas duplicadas ao montar tela (preferir React Query com `staleTime`/`enabled` adequados)

## UI/UX mobile

- loading, erro, estado vazio
- botões com área de toque confortável
- formulários com scroll quando o teclado abrir
- inputs não cobertos pelo teclado
- safe area (iOS) e margens inferiores

### Máscaras e validação (pt-BR)

Mesmo padrão do painel: moeda, CPF, CNPJ, CEP, telefone, e-mail, datas com **date picker** (não input texto puro). Período: data final ≥ inicial.

### Mensagens de erro

- linguagem simples, abaixo do campo ou em destaque discreto
- preservar dados do formulário após erro quando possível

## Navegação

- Definições em `src/navigation/`
- Manter stacks/tabs consistentes; botão voltar funcional
- Proteger telas autenticadas via contexto de auth
- Não criar rotas duplicadas

## Armazenamento

- Chaves centralizadas em `STORAGE_KEYS` (`storage.ts`)
- Limpar storage no logout (`clearAuthStorage`)
- Não persistir dados sensíveis sem necessidade
- Preferir Secure Store para token

## Permissões do dispositivo

Câmera, galeria, notificações etc. (expo-image-picker, etc.):

- pedir no momento certo
- tratar negação sem travar o fluxo

## Segurança

- HTTPS em produção
- Não logar token ou PII em produção
- Validar inputs; backend é fonte da verdade

## Performance

- `FlatList` / virtualização em listas grandes
- React Query para cache e refetch
- Limpar subscriptions/listeners ao desmontar

## Fluxo de implementação

1. Feature → navigation → services
2. Plano resumido → passos pequenos
3. Testar Android e iOS (e web se a tela existir lá)
4. Sugerir teste manual do fluxo

## Comandos úteis

```bash
cd mobileEscola
npm install
npm run start
npm run android
npm run ios
npm run web
npm run web:build
npm run bump:version
```

## Resposta ao usuário

Informar: plano, arquivos alterados, impacto, riscos, teste manual em dispositivo/simulador.
