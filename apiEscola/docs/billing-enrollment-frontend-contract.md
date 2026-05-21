# Contrato Frontend - Regras de Billing e Enrollment

Este documento define exatamente como o frontend do painel deve consumir e aplicar as regras de cobranca e matricula por tenant.

## Objetivo

Centralizar no backend as regras de negocio de cobranca e matricula, e no frontend apenas:
- renderizar configuracoes;
- enviar alteracoes;
- adaptar UX conforme os valores retornados.

## Endpoints

Base: /api/tenant-billing-settings

- GET /schema
- GET /
- GET /{scope}
- PUT /{scope}
- POST /{scope}/reset

Scopes validos:
- billing
- payment
- enrollment

## Fluxo recomendado no frontend

1. Carregar configuracao da tela:
- GET /api/tenant-billing-settings/schema
- GET /api/tenant-billing-settings

2. Montar UI por escopo:
- usar body.scope_descriptions para texto longo de cada aba;
- usar body.schema para definicao de campos;
- usar body.settings para valores efetivos;
- opcional: usar body.settings_meta para metadados por chave.

3. Salvar por escopo:
- PUT /api/tenant-billing-settings/{scope}
- body:

```json
{
  "values": {
    "chave": "valor"
  }
}
```

4. Restaurar padroes de um escopo:
- POST /api/tenant-billing-settings/{scope}/reset

## Contrato de resposta (resumo)

### GET /schema

```json
{
  "type": "success",
  "message": "...",
  "body": {
    "schema": { "billing": {}, "payment": {}, "enrollment": {} },
    "defaults": { "billing": {}, "payment": {}, "enrollment": {} },
    "scope_descriptions": {
      "billing": "...",
      "payment": "...",
      "enrollment": "..."
    }
  }
}
```

### GET /

```json
{
  "type": "success",
  "message": "...",
  "body": {
    "tenant_id": 1,
    "settings": {
      "billing": {},
      "payment": {},
      "enrollment": {}
    },
    "settings_meta": {
      "billing": {
        "alguma_chave": {
          "value": true,
          "type": "bool",
          "label": "...",
          "description": "...",
          "default": true,
          "options": null,
          "stored": true
        }
      }
    }
  }
}
```

### GET /{scope}

```json
{
  "type": "success",
  "message": "...",
  "body": {
    "tenant_id": 1,
    "scope": "billing",
    "values": {},
    "values_meta": {}
  }
}
```

## Regras que impactam matricula e cobranca

### billing.charges_enrollment_fee
- false: nao cria invoice de enrollment_fee em subscribe/subscribeBundle;
- true: cria normalmente.

Impacto no front:
- ocultar/mostrar blocos de taxa de matricula;
- nao assumir que sempre existira enrollment_fee no retorno.

### billing.allow_monthlies_before_fee_paid
- false: se houver taxa de matricula pendente/overdue, generateCharges bloqueia mensalidades com 422;
- true: permite gerar mensalidades sem esse bloqueio.

Impacto no front:
- tratar 422 com mensagem de bloqueio e orientar usuario a quitar taxa.

### billing.enrollment_fee_covers_first_month
- true: mensalidade comeca a partir do segundo mes;
- false: mensalidade comeca no primeiro ciclo.

Impacto no front:
- exibir aviso informativo no resumo financeiro da matricula.

### billing.charge_first_monthly_at_enrollment
- true (padrao): se o plano **nao** tem `enrollment_fee_amount`, `POST /enrollments/subscribe` cria a **primeira mensalidade** no ato;
- false: matricula por plano sem taxa nao cria cobranca inicial (gerar mensalidades depois em lote).

Impacto no front:
- exibir bloco de pagamento como "Primeira mensalidade" (nao "Taxa de matricula");
- reutilizar `enrollment_payment` para marcar essa mensalidade como paga no ato.

### billing.default_payment_due_day
- aplicado quando payment_due_day nao e enviado no payload.

Impacto no front:
- pre-preencher campo de vencimento com esse valor.

### enrollment.require_cpf_to_enroll
- true: CPF obrigatorio para concluir matricula (aluno/pagador);
- false: matricula pode seguir sem CPF.

Impacto no front:
- validacao condicional do CPF antes do submit.

### enrollment.require_guardian_for_minors
- true: menor de idade exige responsavel financeiro;
- false: permite seguir sem responsavel para menor (fallback para aluno).

Impacto no front:
- mostrar/esconder obrigatoriedade do responsavel conforme flag.

## Comportamento esperado de erro

- 403: usuario sem permissao para tenant/acao.
- 404: tenant ou scope invalido.
- 422: validacao de payload ou regra de negocio.

## Permissoes

- super_admin: pode operar qualquer tenant com query param tenant_id.
- admin, manager, financial: apenas no proprio tenant.

## Boas praticas de implementacao no front

- sempre tratar schema como fonte de verdade (evitar hardcode de campos);
- persistir alteracao por escopo (nao enviar todos os escopos de uma vez);
- renderizar description do campo como helper text;
- usar scope_descriptions como texto da aba;
- ao salvar, atualizar estado local com o retorno do backend (nao recalcular no cliente).

## Checklist rapido

- [ ] tela com abas billing/payment/enrollment
- [ ] carrega GET /schema e GET /
- [ ] renderizacao dinamica por type/options/min/max
- [ ] save por scope com PUT /{scope}
- [ ] reset por scope com POST /{scope}/reset
- [ ] tratamento de erro 403/404/422
- [ ] mensagens de UX para bloqueios de regra
