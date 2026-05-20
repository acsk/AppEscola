# Tema do app mobile por tenant

Cada escola (tenant) pode personalizar as cores exibidas no **mobileEscola**. A logo continua em `tenants.photo_url` (já usada no login/`/me`).

Persistência (`tenant_settings`, `module = mobile_theme`):

| key | Conteúdo |
|-----|----------|
| `template_id` | Slug do template (`default`, `emerald`, `ocean`, `sunset`, `ruby`, `violet`, `graphite`) |
| `colors` | Sobrescritas parciais sobre o template escolhido |

Cores efetivas = **template** + **overrides**.

Templates definidos em `config/tenant_mobile_theme.php` (6 opções + personalização campo a campo).

---

## Painel (`painelEscola`)

Autenticação: Bearer Sanctum. Roles com leitura: `admin`, `super_admin`, `professor`, `manager`, `financial`.

Alteração: `admin`, `manager`, `financial` do tenant (ou `super_admin` com `?tenant_id=`).

### Carregar tela

```http
GET /api/tenant-mobile-theme
Authorization: Bearer {token}
```

Resposta (`body`) inclui:

- `templates[]` — catálogo de templates prontos
- `template_id` — template ativo do tenant
- `template_colors` — paleta base do template ativo
- `colors` — paleta **efetiva** (template + overrides)
- `color_overrides` — só sobrescritas salvas
- `schema` — metadados para o formulário do painel
- `logo_url` — somente leitura (upload em `POST /api/tenants/{id}/upload-photo`)

### Salvar (parcial ou completo)

```http
PUT /api/tenant-mobile-theme
Authorization: Bearer {token}
Content-Type: application/json

{
  "template_id": "emerald",
  "clear_overrides": true,
  "colors": {
    "menu_button_text": "#14532D"
  }
}
```

- `template_id` — aplica um template pronto (use `clear_overrides: true` para descartar ajustes antigos).
- `colors` — sobrescreve apenas as chaves enviadas sobre o template ativo.
- Valores: `#RRGGBB`, `#RGB` ou `rgba(...)` (botões ativos do menu).

### Restaurar padrão do sistema

```http
POST /api/tenant-mobile-theme/reset
Authorization: Bearer {token}
```

---

## Mobile (`mobileEscola`)

Role: `aluno`. Chamar após login (ou no bootstrap do app) para aplicar tema.

```http
GET /api/aluno/mobile-theme
Authorization: Bearer {token}
```

Resposta (`body`):

```json
{
  "tenant_id": 1,
  "tenant_name": "Escola Exemplo",
  "logo_url": "https://.../logo.png",
  "colors": {
    "primary": "#4F46E5",
    "ink": "#1E1B4B",
    "text": "#312E81",
    "muted": "#64748B",
    "soft": "#EEF2FF",
    "border": "#DDE3F5",
    "surface": "#FFFFFF",
    "background": "#F6F7FB",
    "debit": "#EF4444",
    "credit": "#10B981"
  }
}
```

### Integração sugerida no mobile

1. Buscar `GET /api/aluno/mobile-theme` após autenticação.
2. Mesclar `body.colors` no objeto `theme.colors` (mesmas chaves do arquivo `src/theme/index.ts`).
3. Usar `logo_url` onde hoje usa `user.tenant.photo_url` (opcional — `/me` já traz `photo_url` no tenant).

Chaves principais:

| Grupo | Chaves |
|-------|--------|
| Marca | `primary`, `tab_bar_inactive` |
| Menu lateral | `drawer_header_title`, `drawer_header_subtitle`, `drawer_header_icon`, `drawer_section_label` |
| Botões do menu | `menu_button_background`, `menu_button_text`, `menu_button_icon`, `menu_button_icon_background`, `menu_button_chevron`, `menu_button_active_*` |
| Telas | `ink`, `text`, `muted`, `soft`, `border`, `surface`, `background` |
| Status | `debit`, `credit` |

Templates: `default`, `emerald`, `ocean`, `sunset`, `ruby`, `violet`, `graphite`.
