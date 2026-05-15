# MobileEscola - Financeiro (Cobrancas do Aluno)

## Objetivo

Este documento define o contrato do endpoint usado no app mobile para exibir:
- cobrancas pagas
- cobrancas atrasadas
- somente a cobranca atual (vigente no mes)

Endpoint pensado para a tela de Financeiro do aluno.

## Endpoint

Metodo: GET
Rota: /api/aluno/boletos
Autenticacao: Bearer token (usuario com role aluno)

Metodo: GET
Rota: /api/aluno/cobrancas/{invoice}/payment-options
Autenticacao: Bearer token (usuario com role aluno)

Metodo: POST
Rota: /api/aluno/cobrancas/{invoice}/generate-charge
Autenticacao: Bearer token (usuario com role aluno)

Body para gerar cobranca:
{
  "method": "pix" | "boleto",
  "environment": "stage" | "prod" (opcional)
}

## Regras de negocio aplicadas no backend

1. Usuario autenticado deve ter role aluno.
2. Aluno deve estar ativo e vinculado ao mesmo tenant do usuario.
3. Agrupamento:
  - pagas: invoices com status paid
  - atrasados: invoices em aberto com due_date menor que hoje
  - atual: apenas uma invoice em aberto do mes atual (a mais proxima de hoje)

## Formato de resposta

Envelope padrao da API:
- type: success | error
- message: mensagem descritiva
- body: payload

Body retornado:
- student_id
- referencia
  - hoje
  - inicio_mes
  - fim_mes
- pagas: lista de cobrancas pagas
- atrasados: lista de cobrancas atrasadas
- atual: objeto da cobranca atual (ou null)
- resumo
  - quantidade_pagas
  - quantidade_atrasados
  - possui_atual
  - valor_total_pagas
  - valor_total_atrasados
  - valor_atual

## Campos de cada cobranca

- id
- enrollment_id
- description
- amount (string decimal)
- due_date (YYYY-MM-DD)
- status
- payment_method
- boleto_number
- boleto_digitable
- payment_url
- pix_copy_paste
- pix_qr_image_url
- is_overdue

## Endpoint de opcoes de pagamento

Use este endpoint para o mobile saber quais opcoes mostrar antes de gerar a cobranca.

GET /api/aluno/cobrancas/{invoice}/payment-options

Resposta:
- invoice: dados da cobranca
- allowed_methods: metodos permitidos para esta cobranca
- current_method: metodo atualmente salvo
- actions
  - can_generate_charge
  - can_change_method
  - can_open_boleto_url
  - can_copy_boleto_line
  - can_copy_pix_code
- method_lock
  - locked
  - method
  - reason
- payment_assets
  - boleto_number
  - boleto_digitable
  - boleto_url
  - pix_copy_paste
  - pix_qr_image_url

### Regra para cobrancas sincronizadas/importadas da Cora

Quando a invoice vier de uma cobranca sincronizada da Cora, o mobile nao deve tentar gerar outro tipo de cobranca.

Nesses casos, o backend retorna no payment-options:
- allowed_methods com apenas 1 metodo
- actions.can_change_method = false
- method_lock.locked = true
- method_lock.method = "boleto" ou "pix"
- method_lock.reason = "synced_charge_method_lock"

Comportamento esperado no app:
- esconder ou desabilitar o seletor de metodo
- exibir somente o metodo retornado em method_lock.method
- usar os assets retornados para pagar a cobranca como ela ja existe na Cora
- nao tentar gerar pix a partir de boleto sincronizado
- nao tentar gerar boleto a partir de pix sincronizado

Observacao:
- para cobrancas normais criadas pelo proprio sistema, o backend pode continuar retornando allowed_methods com ["pix", "boleto"]
- a trava vale somente para cobrancas sincronizadas/importadas

### Opcao conjunta boleto + PIX na mesma cobranca

Quando a mesma invoice possuir assets de boleto e de PIX, o mobile pode exibir as duas formas de pagamento na mesma tela, sem gerar nova cobranca.

Nesse caso:
- `boleto_digitable` e/ou `boleto_number` representam a opcao de boleto
- `pix_copy_paste` e/ou `pix_qr_image_url` representam a opcao de PIX
- ambos pertencem a mesma invoice e ao mesmo `charge_id`
- o app deve apenas escolher qual canal exibir/usar, sem chamar outra criacao de cobranca

Regra pratica para a tela:
- se vier apenas boleto, mostrar boleto
- se vier apenas PIX, mostrar PIX
- se vier boleto e PIX juntos, mostrar os dois como alternativas da mesma cobranca
- se houver `method_lock`, respeitar o metodo travado como principal, mas continuar usando os assets ja existentes da invoice

## Endpoint para gerar cobranca com metodo escolhido

POST /api/aluno/cobrancas/{invoice}/generate-charge

Body exemplo PIX:
{
  "method": "pix"
}

Body exemplo boleto:
{
  "method": "boleto"
}

Resposta:
- invoice_id
- method
- status
- charge_id
- reused_existing_charge
- payment_assets
  - boleto_number
  - boleto_digitable
  - boleto_url
  - pix_copy_paste
  - pix_qr_image_url
- actions
  - can_open_boleto_url
  - can_copy_boleto_line
  - can_copy_pix_code

### Respostas esperadas para cobrancas sincronizadas/importadas

Caso o app tente trocar o metodo de uma cobranca sincronizada/importada, o backend retorna erro 422 com payload semelhante a:

```json
{
  "type": "error",
  "message": "Esta cobrança foi sincronizada e deve manter o método original.",
  "body": {
    "requested_method": "pix",
    "locked_method": "bank_slip",
    "locked_reason": "synced_charge_method_lock"
  }
}
```

Caso a cobranca sincronizada ja possua assets reutilizaveis, o backend responde sucesso sem gerar uma nova cobranca:
- reused_existing_charge = true
- method igual ao metodo original da cobranca sincronizada

## Servico mobile para QR Code do PIX

Arquivo no app mobile:
- mobileEscola/src/services/financeiro.service.ts

Funcoes disponiveis:
- buildPixQrCodeImageUrl(pixCopyPaste, size?)
  - recebe o codigo PIX copia e cola
  - retorna uma URL de imagem PNG de QR Code
- resolvePixQrImageUrl(assets, size?)
  - prioriza assets.pix_qr_image_url retornado pelo backend
  - se nao existir, gera fallback com assets.pix_copy_paste

Uso recomendado na tela:
1. Buscar payment options (ou gerar cobranca)
2. Ler payment_assets da resposta
3. Resolver imagem com resolvePixQrImageUrl(payment_assets)
4. Renderizar em componente Image

Exemplo de uso (TypeScript):

```ts
import { resolvePixQrImageUrl } from '../../services/financeiro.service';

const qrUrl = resolvePixQrImageUrl(response.payment_assets, 320);
// se qrUrl existir, renderizar <Image source={{ uri: qrUrl }} />
```

Fallback previsto:
- se o backend nao enviar pix_qr_image_url, o app gera o QR localmente a partir de pix_copy_paste
- se nenhum dos dois existir, nao exibir bloco de QR

## Exemplo de resposta

{
  "type": "success",
  "message": "Cobrancas carregadas com sucesso.",
  "body": {
    "student_id": 12,
    "referencia": {
      "hoje": "2026-05-13",
      "inicio_mes": "2026-05-01",
      "fim_mes": "2026-05-31"
    },
    "pagas": [
      {
        "id": 41,
        "enrollment_id": 3,
        "description": "Mensalidade Marco/2026",
        "amount": "650.00",
        "due_date": "2026-03-10",
        "status": "paid",
        "payment_method": "pix",
        "boleto_number": null,
        "boleto_digitable": null,
        "payment_url": null,
        "is_overdue": false
      }
    ],
    "atrasados": [
      {
        "id": 44,
        "enrollment_id": 3,
        "description": "Mensalidade Abril/2026",
        "amount": "650.00",
        "due_date": "2026-04-10",
        "status": "pending",
        "payment_method": "bank_slip",
        "boleto_number": "34191...",
        "boleto_digitable": "34191...",
        "payment_url": "https://...",
        "is_overdue": true
      }
    ],
    "atual": {
      "id": 45,
      "enrollment_id": 3,
      "description": "Mensalidade Maio/2026",
      "amount": "650.00",
      "due_date": "2026-05-25",
      "status": "pending",
      "payment_method": "bank_slip",
      "boleto_number": "34191...",
      "boleto_digitable": "34191...",
      "payment_url": "https://...",
      "is_overdue": false
    },
    "resumo": {
      "quantidade_pagas": 1,
      "quantidade_atrasados": 1,
      "possui_atual": true,
      "valor_total_pagas": 650,
      "valor_total_atrasados": 650,
      "valor_atual": 650
    }
  }
}

## Estados de tela recomendados no mobile

1. Loading
- Exibir skeleton ou indicador de carregamento.

2. Sucesso com listas vazias
- Exibir mensagem "Nenhuma cobranca encontrada".

3. Sucesso com dados
- Bloco 1: Atrasados (prioridade visual)
- Bloco 2: Atual
- Bloco 3: Pagas (historico)
- Exibir resumo no topo da tela.

4. Erro 401
- Token invalido/expirado: forcar relogin.

5. Erro 403
- Usuario sem perfil aluno ou aluno inativo.

## Acoes esperadas no app

- Escolher forma de pagamento: PIX ou boleto
- Gerar cobranca para a forma escolhida
- Copiar numero do boleto (boleto_number) quando existir
- Copiar linha digitavel (boleto_digitable) quando existir
- Exibir QR Code PIX (pix_qr_image_url) quando existir
- Copiar PIX copia e cola (pix_copy_paste) quando existir
- Abrir payment_url quando existir

## Fluxo sugerido para UX

1. Carregar /api/aluno/boletos
2. Selecionar cobranca atual ou atrasada
3. Chamar /api/aluno/cobrancas/{invoice}/payment-options
4. Se method_lock.locked = true, nao permitir troca de metodo e exibir a cobranca como veio da Cora
5. Se method_lock.locked = false, permitir que o usuario escolha PIX ou boleto
6. Chamar /api/aluno/cobrancas/{invoice}/generate-charge apenas quando a troca/geracao for permitida
7. Exibir acoes de acordo com payment_assets:
  - PIX: QR image + copia e cola
  - Boleto: URL + linha digitavel + numero do boleto

## Regra de reutilizacao de cobranca

O backend agora evita gerar uma nova cobranca quando ja existir uma cobranca aberta para a mesma invoice e o mesmo metodo solicitado.

Casos em que a cobranca existente sera reutilizada:
- mesmo metodo solicitado
- existe charge_id salvo
- status da cobranca no provedor esta OPEN ou PENDING
- os assets do metodo ainda existem

Casos em que uma nova cobranca sera gerada:
- nao existe cobranca anterior
- o metodo solicitado mudou (ex.: antes boleto, agora pix)
- nao existem assets salvos para o metodo
- a cobranca anterior nao esta mais aberta

Excecao importante:
- se a cobranca for sincronizada/importada da Cora, o backend nao deve gerar um novo metodo; ele deve manter o metodo original

Ao chamar o endpoint de geracao, verificar o campo:
- reused_existing_charge: true -> backend reaproveitou a cobranca anterior
- reused_existing_charge: false -> backend gerou uma nova cobranca

Para cobrancas sincronizadas/importadas, verificar tambem no payment-options:
- method_lock.locked
- method_lock.method
- actions.can_change_method
- allowed_methods

Se houver trava:
- usar apenas o metodo retornado
- nao oferecer botao de troca de metodo
- tratar erro 422 com locked_reason = synced_charge_method_lock como regra de negocio esperada

## Observacao importante

A tela de Financeiro do mobile hoje ainda usa dados mockados.
Para integrar este endpoint, substituir o mock por chamada real para /api/aluno/boletos e mapear os grupos pagas, atrasados e atual.
