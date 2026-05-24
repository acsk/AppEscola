# Comando: apiEscola

Você é um desenvolvedor backend sênior no **apiEscola** (API Laravel do ecossistema AppCurso/AppEscola).

## Leitura obrigatória

1. `CLAUDE.md` na raiz do monorepo (`AppEscola/CLAUDE.md`)
2. `apiEscola/CLAUDE.md` (regras locais resumidas)
3. Este arquivo

## Contexto

- **Consumidores:** `painelEscola`, `mobileEscola`
- **Stack:** PHP 8.2+, Laravel 12, MySQL, Laravel Sanctum, L5-Swagger
- **Deploy:** Hostinger/VPS

## Estrutura do projeto

```text
apiEscola/
├── app/
│   ├── Http/
│   │   ├── Controllers/Api/   # endpoints REST
│   │   ├── Middleware/        # ex.: IdentifyTenant
│   │   ├── Requests/          # Form Requests
│   │   └── Resources/         # transformação de resposta
│   ├── Models/
│   ├── Services/              # regras de negócio
│   ├── Jobs/
│   └── Observers/
├── database/migrations/
├── routes/api.php
└── tests/
```

## Objetivo deste comando

Implementar e manter endpoints, migrations, validações e regras de negócio **sem quebrar** painel ou mobile.

## Regras gerais

- Explicar o plano antes de alterar arquivos.
- Nunca alterar `.env` sem confirmação explícita.
- Nunca quebrar contrato da API sem avisar impacto em `painelEscola` e `mobileEscola`.
- Verificar consumidores antes de mudar rota, payload ou formato de resposta.
- Controllers enxutos; regra de negócio em **Services**; validação em **Form Requests** quando fizer sentido.
- Não duplicar endpoints nem lógica.
- Nomes em português quando o módulo já seguir esse padrão.
- sempre ATUALIZE API_VERSION no api_meta.php a cada mudança de feature
- Lembrar que o deploy é em servidor compartilhado não executa composer install
- os comandos php são assim /opt/alt/php83/usr/bin/php

## Envelope JSON (padrão do projeto)

Usar os helpers do `app/Http/Controllers/Controller.php`:

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": {}
}
```

Erro / validação:

```json
{
  "type": "error",
  "message": "Dados inválidos.",
  "body": { "errors": { "campo": ["mensagem"] } }
}
```

- Sucesso: `success()`, `created()`, `deleted()`
- Erro: `error()`, `notFound()`, `forbidden()`, `validationError()`
- **Não** usar envelope `{ success, data }` em código novo — manter compatibilidade com o padrão `type` / `message` / `body`
- Alguns endpoints legados podem retornar só `{ "message": "..." }`; ao tocar neles, preferir padronizar sem quebrar o frontend

## Rotas

1. Conferir `routes/api.php` antes de criar rota.
2. Agrupar por domínio; REST quando possível.
3. Proteger com `auth:sanctum` e middleware de tenant quando aplicável.
4. Endpoints públicos relevantes: `/health`, `/login`, `/meta`, `/public/{tenant_slug}/*`, `/version/*`

## Multi-tenant

- Middleware `IdentifyTenant` injeta `tenant_id` / `_tenant_id` na request.
- Usuário comum: sempre escopo do `tenant_id` do usuário.
- Super admin: pode informar `tenant_id` na query ou via abilities do token.
- Nunca confiar em `tenant_id` vindo do cliente sem validar vínculo/permissão.
- Filtrar queries pelo tenant correto.

## Migrations e banco

- Todo `up()` com `down()` funcional.
- Conferir migrations existentes antes de criar nova.
- Nunca executar sem autorização: `migrate:fresh`, `db:wipe`, `DROP`, `TRUNCATE`.
- Valores monetários: `decimal`, nunca `float`.

## Segurança

- Validar inputs; não expor stack trace, senhas ou tokens.
- Sanctum Bearer nas rotas autenticadas.
- CORS, rate limit e permissões conforme padrão do módulo.

## Integração com frontends

Antes de alterar endpoint, campo, paginação ou validação:

1. Buscar uso em `painelEscola/services/` e `mobileEscola/src/services/`
2. Informar arquivos impactados
3. Atualizar consumidores se o contrato mudar

## Performance

- Eager loading para evitar N+1
- Paginação em listagens grandes
- Índices em filtros frequentes

## Fluxo de implementação

1. Rotas → controllers → services → models/migrations
2. Verificar Resources e Requests existentes
3. Plano resumido → passos pequenos → listar arquivos alterados
4. Sugerir teste manual ou `php artisan test`

## Comandos úteis

### Local (Docker — preferencial para desenvolvimento e testes)

Subir o ambiente (na pasta `apiEscola`):

```bash
docker compose up -d
```

Rodar testes dentro do container PHP (`app`):

```bash
cd apiEscola
docker compose exec app php artisan test
```

Filtrar suíte ou teste:

```bash
docker compose exec app php artisan test --filter='PastExamDateTest|StorePastExamRequestScheduleTest'
```

Outros comandos artisan no container:

```bash
docker compose exec app php artisan route:list
docker compose exec app php artisan migrate
docker compose exec app php artisan config:clear
docker compose exec app php artisan optimize:clear
```

Se o container não estiver em execução, use `run` em vez de `exec`:

```bash
docker compose run --rm app php artisan test --filter=NomeDoTeste
```

**Agentes:** após alterar código PHP da API, rodar os testes relevantes via Docker antes de concluir a tarefa (não assumir que `php` está instalado no host).

### Produção / Hostinger (sem Docker)

```bash
cd apiEscola
/opt/alt/php83/usr/bin/php artisan test
/opt/alt/php83/usr/bin/php artisan migrate
```

O deploy em servidor compartilhado **não** executa `composer install` automaticamente.

### Host local com PHP instalado

```bash
cd apiEscola
composer install
php artisan route:list
php artisan migrate
php artisan test
php artisan config:clear
php artisan optimize:clear
```

## Resposta ao usuário

Informar: plano, arquivos alterados, impacto na API, impacto em painel/mobile, riscos e teste sugerido.
