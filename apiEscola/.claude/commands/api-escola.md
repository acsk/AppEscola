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
- após criar classes novas: conferir que o arquivo existe e não está vazio antes de registrar rotas (ver **Integridade de arquivos**)

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
4. **Criar/alterar o arquivo PHP ou migration primeiro; só depois** registrar `use` em `routes/api.php` e referências cruzadas
5. Após cada arquivo novo ou reescrito, executar a verificação de integridade (seção abaixo)
6. Sugerir teste manual ou `php artisan test`

## Integridade de arquivos (anti-arquivo vazio)

Bugs recorrentes: `ApplyPatch` falha ou arquivo fica com **0 bytes**; rotas apontam para classe inexistente (`ReflectionException` em produção); migration registrada no batch mas vazia no disco.

### Regras obrigatórias

1. **Nunca encerrar a tarefa** sem confirmar que todo arquivo citado (controller, migration, request, resource) existe no disco e tem conteúdo válido.
2. **Ordem:** implementar o arquivo → ler de volta → só então wire-up (rotas, imports, versão da API).
3. Se um patch falhar ou o `Read` mostrar arquivo vazio/incompleto, **regravar o arquivo inteiro** (`Write` ou patch com conteúdo completo) antes de continuar. Não empilhar patches em arquivo zerado.
4. **Não registrar** em `routes/api.php` `Controller::class` nem `use App\Http\Controllers\...` se o arquivo `.php` correspondente não foi verificado.
5. Migrations: além de `up()`, o `down()` deve desfazer índices/colunas criados no `up()` (ver item 6 do checklist). Arquivo de migration **nunca** pode ficar vazio após edição.

### Verificação mínima (rodar antes de concluir)

Para cada arquivo PHP novo ou reescrito nesta tarefa:

```bash
# Substitua CAMINHO pelo arquivo (ex.: app/Http/Controllers/Api/FooController.php)
wc -l CAMINHO                    # deve ser > 0 (controllers costumam ter dezenas/centenas de linhas)
head -5 CAMINHO                  # deve mostrar <?php e namespace
/opt/alt/php83/usr/bin/php -l CAMINHO   # ou: docker compose exec app php -l CAMINHO
```

Para migrations novas:

```bash
wc -l database/migrations/NOME_DA_MIGRATION.php
grep -E "function up|function down" database/migrations/NOME_DA_MIGRATION.php
```

Para classes referenciadas em rotas:

```bash
php artisan route:list --path=recurso-novo
# Se ReflectionException / class does not exist: o controller não está no servidor ou está vazio — conferir deploy e autoload
```

### Deploy (Hostinger)

Após adicionar classes novas, no servidor:

```bash
/opt/alt/php83/usr/bin/php /usr/local/bin/composer dump-autoload -o
/opt/alt/php83/usr/bin/php artisan optimize:clear
```

Confirmar upload do arquivo (não só `routes/api.php`): `ls -la` + `wc -l` no caminho do controller/migration.

## Checklist anti-regressão (obrigatório antes de concluir)

Use esta lista para evitar bugs recorrentes de consistência e auditoria:

1. **Validação vs migration (NÃO divergir)**
   - Se um campo é `required` no Form Request, a coluna no banco **não pode ser nullable**.
   - Se a coluna é `nullable`, o Request deve aceitar `nullable`/`sometimes`.
   - Sempre comparar Request + migration + regra de negócio antes de finalizar.

2. **`TracksUserActivity` (não duplicar auditoria manual)**
   - Modelos com `TracksUserActivity` **já** preenchem `created_by` e `updated_by` via `Auth::id()`.
   - Em controllers desses modelos, não setar `created_by`/`updated_by` manualmente, salvo necessidade excepcional documentada.
   - Evitar mistura de fontes (`$request->user()?->id` vs `Auth::id()`) para não gerar inconsistência.

3. **`updateOrCreate` e campos de criação**
   - Nunca passar `created_by` (ou campos “imutáveis de criação”) no array de update do `updateOrCreate`.
   - Para preservar auditoria, preferir `firstOrNew` + `save()` e setar `created_by` **apenas** quando `!$model->exists`.

4. **Escopo de tenant em FKs**
   - Não basta `exists:table,id`: validar também se a entidade pertence ao mesmo `tenant_id`.
   - Aplicar essa verificação para `course_id`, `school_class_id`, `subject_id`, `exam_type_id`, `student_id`, `enrollment_id` etc.

5. **Publicação e imutabilidade**
   - Se recurso publicado não deve ser alterado, bloquear update/delete no controller e documentar a regra.
   - Garantir que endpoints de lançamento respeitem o status (`draft`/`published`).

6. **UNIQUE com colunas nullable (MySQL)**
   - Em índices únicos compostos, `NULL` é tratado como valor distinto: várias linhas com `NULL` na mesma chave **não** violam o índice.
   - Se a regra de negócio exige unicidade real, a coluna deve ser `NOT NULL` (após backfill) ou deduplicar/remover órfãos antes de criar o índice.
   - Migration de reparo (`down()` não vazio): desfazer índices/colunas que o `up()` condicional criar.

7. **Arquivo não vazio (controller, migration, request)**
   - Todo arquivo PHP criado ou reescrito nesta tarefa: `wc -l` > 0, `php -l` sem erro, `Read` confirma classe/`namespace` esperados.
   - Toda classe usada em `routes/api.php` existe no caminho PSR-4 correto **antes** de dar a tarefa por concluída.
   - Se o agente detectar arquivo zerado no meio do trabalho, recriar o conteúdo completo; não assumir que um patch anterior “salvou”.

8. **Verificação final mínima**
   - Rodar lints dos arquivos alterados.
   - Conferir rotas novas com `php artisan route:list` (sem `ReflectionException`).
   - Validar payload de create/update com pelo menos 1 cenário feliz e 1 cenário de erro.
   - Listar no resumo ao usuário os arquivos PHP/migrations **efetivamente gravados** (não só “planejados”).

## Ambiente Docker

Arquivos: `docker-compose.yml` (desenvolvimento local) e `docker-compose.prod.yml` (produção em VPS com imagem baked-in).

Rede interna: `appescola` (bridge). Os serviços se resolvem pelo **nome do service** (`app`, `db`, `nginx`, etc.).

### Desenvolvimento (`docker-compose.yml`)

| Service Compose | Container | Imagem / build | Portas (host) | Função |
|-----------------|-----------|----------------|---------------|--------|
| `app` | `appEscola_php` | `docker/php/Dockerfile` → PHP **8.3-FPM** | — (9000 só na rede interna) | Laravel: `artisan`, testes, Composer, FPM. `working_dir`: `/var/www`. Código montado do host (`.:/var/www`). |
| `nginx` | `appEscola_nginx` | `nginx:1.25-alpine` | **4000** → 80 | HTTP da API. `root`: `/var/www/public`. Encaminha PHP para `app:9000`. |
| `db` | `appEscola_mysql` | `mysql:8.0` | **4006** → 3306 | MySQL. Banco padrão: `appescola`. Usuário/senha dev: `appescola` / `appescola`. Root: `root` / `root`. |
| `phpmyadmin` | `appEscola_phpmyadmin` | `phpmyadmin:5.2` | **4008** → 80 | UI do banco (conecta em `db:3306`). |

**Volume nomeado:** `appescola_mysql_data` — dados persistentes do MySQL entre `down`/`up`.

**Configuração montada:**

- `docker/php/php.ini` → PHP do container `app`
- `docker/nginx/default.conf` → virtual host do `nginx`
- `docker/mysql/my.cnf` → MySQL

**URLs locais (com stack no ar):**

- API: `http://localhost:4000/api` (ex.: health, login, meta)
- phpMyAdmin: `http://localhost:4008`

**`.env` no Docker (desenvolvimento):** dentro dos containers, o host do MySQL é o service `db`, não `127.0.0.1`:

```env
DB_HOST=db
DB_PORT=3306
DB_DATABASE=appescola
DB_USERNAME=appescola
DB_PASSWORD=appescola
```

Do **host** (cliente MySQL na máquina), use `127.0.0.1:4006` se precisar conectar por fora do Compose.

**Ordem de dependência:** `db` → `app` → `nginx`; `phpmyadmin` → `db`.

### Produção (`docker-compose.prod.yml`)

| Service | Container | Observação |
|---------|-----------|------------|
| `app` | `appEscola_php` | Mesma imagem PHP 8.3-FPM; **não** monta o código (está na imagem). `env_file`: `.env.production`. Volume `storage_data` para arquivos públicos. |
| `nginx` | `appEscola_nginx` | Portas **80** e **443**. Serve `storage` via volume read-only. |
| `db` | `appEscola_mysql` | Credenciais via variáveis `${DB_DATABASE}`, `${DB_ROOT_PASSWORD}`, etc. Sem phpMyAdmin. |

Produção em Hostinger compartilhado costuma **não** usar este Compose; ver seção Hostinger abaixo.

### Comandos Docker frequentes

```bash
cd apiEscola

# Subir / parar / status
docker compose up -d
docker compose down
docker compose ps

# Logs
docker compose logs -f app
docker compose logs -f nginx
docker compose logs -f db

# Shell no PHP (debug)
docker compose exec app bash

# Composer (se necessário no container)
docker compose exec app composer install
```

**Serviço para `exec`:** quase sempre `app` (PHP/Artisan). Nunca rodar `migrate:fresh` / `db:wipe` sem autorização explícita do usuário.

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

**Agentes:** após alterar código PHP da API, rodar os testes relevantes via Docker antes de concluir a tarefa (não assumir que `php` está instalado no host). Antes dos testes, aplicar a verificação de **Integridade de arquivos** nos arquivos tocados.

### Produção / Hostinger (sem Docker)

```bash
cd apiEscola
/opt/alt/php83/usr/bin/php artisan test
/opt/alt/php83/usr/bin/php artisan migrate
```

**Diagnóstico — alunos sem login no app (migração / matrícula sem usuário):**

```bash
# Resumo do tenant (matrícula ativa, taxa paga, etc. — pagamento NÃO cria usuário hoje)
/opt/alt/php83/usr/bin/php artisan students:debug-app-access --tenant=2

# Um aluno + detalhe de matrículas/cobranças
/opt/alt/php83/usr/bin/php artisan students:debug-app-access --tenant=2 --student=123

# Exportar JSON
/opt/alt/php83/usr/bin/php artisan students:debug-app-access --tenant=2 --json --save=1

# Corrigir em lote (após conferir o debug)
/opt/alt/php83/usr/bin/php artisan students:provision-users --tenant=2 --dry-run
/opt/alt/php83/usr/bin/php artisan students:provision-users --tenant=2 --show-passwords
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
