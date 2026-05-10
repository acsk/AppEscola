# Versões dos Apps (AppPainel / AppMobile)

Endpoints públicos (sem autenticação) para leitura e atualização das versões dos aplicativos.  
As versões são persistidas na tabela `app_versions` do banco de dados e atualizadas via POST a cada build do CI/CD.

---

## Arquitetura

| Camada | Arquivo |
|--------|---------|
| Migration | `database/migrations/2026_05_10_203604_create_app_versions_table.php` |
| Model | `app/Models/AppVersion.php` |
| Controller | `app/Http/Controllers/Api/AppVersionController.php` |
| Config (fallback) | `config/app_versions.php` |

### Tabela `app_versions`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | bigint PK | - |
| `app` | string unique | `panel` ou `mobile` |
| `version` | integer | Número da versão principal |
| `release` | integer | Número do release/build |
| `release_date` | date | Data do build |
| `created_at` | timestamp | - |
| `updated_at` | timestamp | Atualizado a cada build |

---

## Endpoints

### GET `/api/version/panel`

Retorna a versão atual do **AppPainel** (web).

**Resposta `200`**
```json
{
  "type": "success",
  "message": "Versão carregada com sucesso.",
  "body": {
    "app": "panel",
    "version": "v1.3",
    "release_date": "2026-05-10"
  }
}
```

---

### GET `/api/version/mobile`

Retorna a versão atual do **AppMobile**.

**Resposta `200`**
```json
{
  "type": "success",
  "message": "Versão carregada com sucesso.",
  "body": {
    "app": "mobile",
    "version": "v1.2",
    "release_date": "2026-05-08"
  }
}
```

---

### POST `/api/version/panel`

Atualiza a versão do **AppPainel**. Chamado automaticamente pelo pipeline de build.  
Usa `updateOrCreate` — insere o registro na primeira vez e atualiza nas seguintes.

**Body (JSON)**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `version` | integer | ✅ | Número da versão principal |
| `release` | integer | ✅ | Número do release/build |
| `release_date` | string | ✅ | Data do build (`YYYY-MM-DD`) |

**Exemplo de requisição**
```json
{
  "version": 1,
  "release": 3,
  "release_date": "2026-05-10"
}
```

**Resposta `200`**
```json
{
  "type": "success",
  "message": "Versão atualizada com sucesso.",
  "body": {
    "app": "panel",
    "version": "v1.3",
    "release_date": "2026-05-10"
  }
}
```

---

### POST `/api/version/mobile`

Atualiza a versão do **AppMobile**. Mesmo schema do POST `/api/version/panel`.

**Exemplo de requisição**
```json
{
  "version": 1,
  "release": 2,
  "release_date": "2026-05-08"
}
```

**Resposta `200`**
```json
{
  "type": "success",
  "message": "Versão atualizada com sucesso.",
  "body": {
    "app": "mobile",
    "version": "v1.2",
    "release_date": "2026-05-08"
  }
}
```

---

## Formato da versão

A versão é formatada como `v{version}.{release}`:

| `version` | `release` | Resultado |
|-----------|-----------|-----------|
| 1 | 0 | `v1.0` |
| 1 | 3 | `v1.3` |
| 2 | 0 | `v2.0` |

---

## Fallback (banco vazio)

Se a tabela `app_versions` ainda não tiver registro para o app, o GET retorna os valores de `config/app_versions.php`, que lê as variáveis de ambiente:

```env
APP_PANEL_VERSION=1
APP_PANEL_RELEASE=0
APP_PANEL_RELEASE_DATE=2026-05-10

APP_MOBILE_VERSION=1
APP_MOBILE_RELEASE=0
APP_MOBILE_RELEASE_DATE=2026-05-10
```

---

## Integração no pipeline (CI/CD)

```bash
# Após o build do AppPainel
curl -s -X POST https://api.seudominio.com/api/version/panel \
  -H "Content-Type: application/json" \
  -d "{\"version\": 1, \"release\": $BUILD_NUMBER, \"release_date\": \"$(date +%Y-%m-%d)\"}"

# Após o build do AppMobile
curl -s -X POST https://api.seudominio.com/api/version/mobile \
  -H "Content-Type: application/json" \
  -d "{\"version\": 1, \"release\": $BUILD_NUMBER, \"release_date\": \"$(date +%Y-%m-%d)\"}"
```

