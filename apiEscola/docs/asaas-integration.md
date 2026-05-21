# Integração Asaas

Documentação da integração com a [API Asaas v3](https://docs.asaas.com/reference/comece-por-aqui).

## Credenciais por tenant

Cada escola (tenant) pode ter credenciais **sandbox** (`stage`) e **produção** (`prod`) na tabela `tenant_asaas_credentials`:

| Campo | Descrição |
|-------|-----------|
| `api_key` | Chave da API (criptografada no banco) |
| `webhook_token` | Token do webhook no painel Asaas (criptografado) |
| `webhook_token_hash` | SHA-256 para validar webhooks sem descriptografar tudo |
| `base_url` | Opcional; padrão sandbox ou produção conforme ambiente |

### API (painel admin)

- **Schema:** `GET /api/tenants/{tenant}/payment-providers/asaas/settings`
- **Salvar:** `POST /api/tenants/{tenant}/payment-providers/asaas/settings`
- **Testar:** `POST /api/tenants/{tenant}/payment-providers/asaas/test-connection`

Body de exemplo (salvar):

```json
{
  "environment": "stage",
  "api_key": "$aact_...",
  "webhook_token": "token-que-voce-definiu-no-asaas",
  "base_url": "https://api-sandbox.asaas.com/v3"
}
```

Na **atualização**, `api_key` e `webhook_token` podem ser omitidos para manter os valores já salvos.

### Fallback global (opcional)

Se o tenant **não** tiver credencial, o sistema usa `.env`:

- `ASAAS_API_KEY`
- `ASAAS_BASE_URL`
- `ASAAS_WEBHOOK_TOKEN`

## Provedor padrão do tenant

`tenant_settings` → módulo `payment` → `default_provider` = `asaas`.

## Webhook

URL: `POST {APP_URL}/api/webhooks/asaas`

O token no header `asaas-access-token` deve coincidir com o `webhook_token` cadastrado **para aquele tenant** (ou o global no `.env`).

## Migração

```bash
php artisan migrate
```

## Testes

```bash
php artisan test --filter=Asaas
```
