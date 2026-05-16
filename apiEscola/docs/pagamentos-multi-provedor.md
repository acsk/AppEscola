# Pagamentos Multi-Provedor (Frontend + API)

Este documento define como integrar o frontend com o módulo de pagamentos de forma agnóstica a banco/provedor.

Objetivo: permitir Cora hoje e outros bancos no futuro sem reescrever telas.

## Princípios

- O frontend não deve conhecer detalhes específicos de cada banco.
- O backend encapsula autenticação, certificado, token e payloads específicos.
- O frontend trabalha com um contrato único de configuração e cobrança.

## Status atual da implementação

Hoje o backend já possui duas camadas:

- endpoints específicos da Cora, mantidos por compatibilidade
- endpoints genéricos para frontend multi-provedor

No momento, o único provedor implementado por trás do contrato genérico é a Cora.

## Armazenamento atual das credenciais

As credenciais da Cora foram segregadas para a tabela própria `tenant_cora_credentials`.

As informações recebidas até agora são de **Ambiente de teste**. O contrato já está preparado para gravar também o **Ambiente de produção** no mesmo tenant, em um registro separado.

### Tabela `tenant_cora_credentials`

| Campo | Descrição |
|---|---|
| `tenant_id` | Tenant dono da configuração |
| `client_id` | Client ID da Cora |
| `certificate_path` | Caminho do certificado salvo no storage privado |
| `private_key_path` | Caminho da chave privada salva no storage privado |
| `environment` | `stage` para teste, `prod` para produção |
| `active` | Habilita/desabilita a integração |
| `configured_at` | Data/hora da última configuração |

Regra de unicidade:

- um tenant pode ter 1 credencial de teste (`stage`)
- um tenant pode ter 1 credencial de produção (`prod`)
- o front deve escolher o ambiente antes de salvar ou testar

> O campo `tenant->settings` não é mais a fonte de verdade para Cora. Ele pode existir apenas como legado/fallback durante a transição.

## Endpoints legados (Cora)

### Configuração por tenant

- `GET /api/tenants/{tenant}/cora-settings`
- `POST /api/tenants/{tenant}/cora-settings/upload` (multipart)
- `POST /api/tenants/{tenant}/cora-settings/token`

### Cobrança

- `POST /api/invoices/{invoice}/generate-cora-charge`

## Payload de upload (Cora)

`multipart/form-data`

- `client_id` (string)
- `environment` (`stage` ou `prod`)
- `certificate` (arquivo `.pem`/`.crt`)
- `private_key` (arquivo `.key`/`.pem`)

Sugestão de UI:

- Aba 1: Ambiente de teste
- Aba 2: Ambiente de produção
- Cada aba envia o mesmo payload, mudando apenas o campo `environment`

## Retorno do token (Cora)

Formato retornado no `body`:

```json
{
  "access_token": "...",
  "expires_in": 86400,
  "refresh_expires_in": 0,
  "token_type": "Bearer",
  "not-before-policy": 1614056798,
  "scope": "offline_access"
}
```

## Contrato implementado para o frontend (agnóstico)

O frontend já pode consumir os endpoints abaixo como contrato principal. Mesmo com apenas a Cora implementada hoje, a interface já está preparada para múltiplos bancos.

### 1. Listar provedores disponíveis

`GET /api/payment-gateway-providers`

```json
{
  "type": "success",
  "body": [
    {
      "slug": "cora",
      "name": "Cora",
      "status": "active",
      "capabilities": ["pix", "boleto", "webhook", "mtls_cert_upload"]
    }
  ]
}
```

### 2. Obter schema dinâmico da tela de configuração

`GET /api/tenants/{tenant}/payment-providers/{provider}/settings-schema`

```json
{
  "type": "success",
  "body": {
    "provider": "cora",
    "configured": true,
    "environments": {
      "stage": true,
      "prod": false
    },
    "fields": [
      { "name": "environment", "type": "select", "required": true, "options": ["stage", "prod"] },
      { "name": "client_id", "type": "text", "required": true },
      { "name": "certificate", "type": "file", "required": true },
      { "name": "private_key", "type": "file", "required": true }
    ]
  }
}
```

### 3. Salvar configuração do provedor

`POST /api/tenants/{tenant}/payment-providers/{provider}/settings`

Atualmente, `provider = cora`.

Os dados são salvos em `tenant_cora_credentials` com chave lógica `tenant_id + environment`.

O payload deve sempre enviar `environment` explicitamente:

- `stage` para testar
- `prod` para produção

Exemplo de resposta:

```json
{
  "type": "success",
  "body": {
    "provider": "cora",
    "configured": true,
    "environment": "stage",
    "configured_at": "2026-05-11T18:25:00Z",
    "cert_uploaded": true,
    "key_uploaded": true
  }
}
```

### 4. Testar conexão do provedor

`POST /api/tenants/{tenant}/payment-providers/{provider}/test-connection`

Recomenda-se enviar `environment` no corpo, porque a conexão de teste e a de produção podem ter credenciais diferentes.

```json
{
  "environment": "stage"
}
```

Resposta esperada:

```json
{
  "type": "success",
  "body": {
    "provider": "cora",
    "environment": "stage",
    "ok": true,
    "provider_status": "connected",
    "expires_in": 86400
  }
}
```

### 5. Gerar cobrança (contrato único)

`POST /api/invoices/{invoice}/generate-charge`

```json
{
  "provider": "cora",
  "method": "pix",
  "environment": "prod"
}
```

Retorno recomendado:

```json
{
  "type": "success",
  "body": {
    "invoice_id": 123,
    "provider": "cora",
    "environment": "prod",
    "charge_id": "abc",
    "status": "pending",
    "payment_url": "https://...",
    "pix_copy_paste": "000201...",
    "qr_code_image_url": null,
    "expires_at": null
  }
}
```

### 6. Consultar status da cobrança

`GET /api/invoices/{invoice}/charge-status`

```json
{
  "type": "success",
  "body": {
    "provider": "cora",
    "status": "paid",
    "paid_at": "2026-05-11T14:30:00Z"
  }
}
```

### 7. Pagar cobrança (boleto/PIX em stage - teste)

`POST /api/invoices/{invoice}/pay-charge`

**Apenas em `stage` para testes.** Simula o pagamento de um boleto ou PIX gerado anteriormente.

**Body (opcional):**

```json
{
  "environment": "stage"
}
```

**Resposta esperada `200`:**

```json
{
  "type": "success",
  "message": "Cobrança paga com sucesso.",
  "body": {
    "invoice_id": 123,
    "provider": "cora",
    "environment": "stage",
    "status": "paid",
    "paid_at": "2026-05-11T14:35:00Z"
  }
}
```

## Fluxo completo de pagamento

1. **Admin gera a cobrança** (boleto ou PIX):
   - `POST /api/invoices/{invoice}/generate-charge` com `method` (pix/boleto) e `environment` (stage/prod)
   - Retorna `charge_id`, `payment_url`, `pix_copy_paste` (se PIX)

2. **Cliente vê o boleto/PIX** (no painel ou mobile):
   - Frontend exibe o código de barras (boleto) ou QR-code (PIX)
   - Ou redireciona para `payment_url`

3. **Em stage (testes), admin simula o pagamento**:
   - `POST /api/invoices/{invoice}/pay-charge` com `environment: stage`
   - Fatura é marcada como `paid` automaticamente
   - **IMPORTANTE**: Apenas em `stage` para testes. Em `prod`, webhooks da Cora confirmam o pagamento real.

4. **Consultar status em tempo real**:
   - `GET /api/invoices/{invoice}/charge-status` para saber se foi pago

## Mapeamento para UI (frontend)

- Tela "Configuração de Pagamento": renderizar campos por schema dinâmico.
- Na tela da Cora, separar visualmente "Ambiente de teste" e "Ambiente de produção".
- Tela "Cobrança": usar apenas campos unificados (`status`, `payment_url`, `pix_copy_paste`).
- Em **stage**: mostrar botão "Simular Pagamento" que chama `pay-charge`
- Em **prod**: pagamento real via webhook da Cora
- Evitar regras condicionais por banco no frontend.

## Estratégia recomendada de uso no frontend

Use esta ordem:

1. consumir `GET /api/payment-gateway-providers`
2. carregar `settings-schema` para montar o formulário dinamicamente
3. escolher `environment` (`stage` ou `prod`) na UI
4. salvar configuração pelo endpoint genérico de `settings`
5. testar conexão com `test-connection` informando o ambiente
6. gerar cobrança com `POST /api/invoices/{invoice}/generate-charge` informando o ambiente e método (pix/boleto)
7. consultar andamento com `GET /api/invoices/{invoice}/charge-status`
8. **Em stage**: chamar `POST /api/invoices/{invoice}/pay-charge` para simular pagamento
9. **Em prod**: aguardar webhook da Cora para confirmação de pagamento real

Os endpoints legados da Cora devem ser usados apenas para compatibilidade ou diagnóstico.

## Regras de segurança

- Nunca expor certificado/chave em responses.
- Nunca persistir token de banco no frontend.
- Retornar token completo somente para teste administrativo controlado.
- Em produção, preferir `test-connection` com `ok/erro` sem expor token.
- Armazenar payload bruto de provedores apenas no backend para auditoria/debug.
- Endpoint `pay-charge` apenas para admins (roles: super_admin, admin).
- Apenas permitir `pay-charge` em `stage` para evitar pagamentos duplos.

## Próxima evolução recomendada

- Criar camada de estratégia por provedor no backend (`PaymentProviderInterface`).
- Adicionar novos provedores além da Cora dentro do mesmo contrato genérico.
- Fazer `charge-status` consultar o provedor em tempo real ou via sincronização/webhook.
- Manter endpoint legado da Cora durante a transição, até o frontend migrar 100% para o contrato genérico.
- Avaliar criptografia em repouso para `client_id` e padronização de armazenamento dos arquivos sensíveis.
- Implementar retry automático e sincronização periódica com status de pagamentos na Cora.
