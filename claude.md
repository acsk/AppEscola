# CLAUDE.md

## Contexto Geral do Projeto

Este repositório contém múltiplos projetos do ecossistema AppCurso/AppEscola.

Estrutura principal:

```text
/apiEscola
/painelEscola
/mobileEscola
```

Todos os projetos possuem integração entre si.

---

## Comandos por projeto (`.claude/commands`)

As diretrizes específicas de cada projeto ficam em arquivos Markdown em `.claude/commands`, **dentro da pasta do projeto** (não na raiz do monorepo):

| Projeto | Comando |
|---------|---------|
| apiEscola | `apiEscola/.claude/commands/api-escola.md` |
| painelEscola | `painelEscola/.claude/commands/painel-escola.md` |
| mobileEscola | `mobileEscola/.claude/commands/mobile-escola.md` |

Antes de implementar alterações, sempre considerar:

1. Este `CLAUDE.md` da raiz.
2. O comando do projeto em que você está trabalhando (caminhos acima).
3. O `CLAUDE.md` local do projeto, quando existir (ex.: `apiEscola/CLAUDE.md`).
4. O padrão real encontrado nos arquivos do projeto.

---

## Objetivo Geral

Manter:
- padronização
- organização
- compatibilidade entre projetos
- estabilidade
- responsividade
- integração correta entre frontend e backend

---

## Regras Gerais

- Antes de alterar arquivos, explicar o plano resumidamente.
- Nunca alterar múltiplos projetos sem informar impacto.
- Nunca quebrar compatibilidade entre API e frontends.
- Sempre verificar consumidores antes de alterar endpoints.
- Sempre verificar impacto entre:
  - apiEscola
  - painelEscola
  - mobileEscola

---

## Estrutura dos Projetos

### apiEscola

Backend Laravel responsável por:
- autenticação
- regras de negócio
- APIs REST
- integrações
- financeiro
- gestão escolar

### painelEscola

Painel administrativo do sistema.

Responsável por:
- gestão administrativa
- dashboards
- financeiro
- relatórios
- cadastros
- permissões

### mobileEscola

Frontend mobile do ambiente escolar/aluno/responsável.

Responsável por:
- área do aluno
- acesso escolar
- consumo das APIs
- funcionalidades do usuário final

---

## Regras de Integração

Antes de alterar:
- endpoints
- payloads
- autenticação
- contratos de resposta
- nomes de campos
- validações

Sempre:
1. verificar consumidores
2. verificar impacto
3. atualizar integrações necessárias
4. informar mudanças realizadas

---

## Regras de Banco/API

- Nunca remover colunas sem explicar impacto.
- Nunca executar comandos destrutivos sem confirmação.
- Nunca usar:
  - `migrate:fresh`
  - `db:wipe`
  - `drop table`
  - `truncate`

sem autorização explícita.

- Toda migration deve possuir rollback.
- Validar compatibilidade com frontend.

---

## Padrão de Desenvolvimento

- Priorizar código simples e legível.
- Evitar duplicação.
- Reutilizar componentes e services.
- Manter separação de responsabilidades.
- Controllers enxutos.
- Services para regras de negócio.
- Validar dados antes de persistir.
- Tratar erros corretamente.

---

## Segurança

- Não expor dados sensíveis.
- Validar permissões.
- Validar autenticação.
- Tratar token expirado.
- Validar inputs.
- Não confiar apenas no frontend.

---

## Responsividade

Todas as telas devem:
- funcionar no mobile
- funcionar no tablet
- funcionar no desktop

Evitar:
- quebra de layout
- overflow horizontal
- componentes desalinhados

---

## Fluxo esperado antes de implementar

Sempre:
1. analisar arquivos relacionados
2. verificar padrões existentes
3. verificar integrações
4. explicar plano resumido
5. implementar em pequenos passos
6. informar arquivos alterados
7. validar impacto entre projetos

---

## Comandos úteis

### Backend

```bash
php artisan route:list
php artisan migrate
php artisan test
composer install
```

### Frontend

```bash
npm install
npm run dev
npm run build
npm run lint
```