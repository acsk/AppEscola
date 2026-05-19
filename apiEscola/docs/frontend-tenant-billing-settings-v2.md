# Frontend - Configuracoes de Cobranca por Tenant (V2)

Este documento descreve como o front deve consumir e renderizar a tela de configuracoes de cobranca/matricula por tenant.

## Objetivo

- Renderizar formulario dinamico por escopo: billing, payment, enrollment.
- Consumir apenas dados persistidos por padrao.
- Usar schema filtrado pelo provedor selecionado no tenant.

## Endpoints

Base: /api/tenant-billing-settings

- GET /schema
- GET /
- GET /{scope}
- PUT /{scope}
- POST /{scope}/reset

## Comportamento atual (importante)

### 1) GET /api/tenant-billing-settings/schema

Retorna:
- schema (dinamico por tenant/provedor)
- defaults (tambem dinamico por tenant/provedor)
- scope_descriptions
- tenant_id
- mode: persisted
- settings (persistidos flat)
- persisted_settings (persistidos com metadados)

### 2) GET /api/tenant-billing-settings

Sem query param:
- modo padrao = persisted
- retorna settings com valores primitivos (sem objetos nos campos)

Com ?mode=effective:
- retorna merge com defaults
- inclui settings_meta e persisted_settings

### 3) GET /api/tenant-billing-settings/{scope}

Sem query param:
- modo padrao = persisted
- retorna values flat

Com ?mode=effective:
- retorna values em modo efetivo + values_meta + persisted_values

## Regra de renderizacao no front

Use sempre:
- body.schema para montar campos
- body.settings para valores da tela

Nao renderizar persisted_settings diretamente em input, pois persisted_settings contem objeto com metadados.

## Tipos de campo

- bool -> switch/checkbox
- int -> input numerico (respeitar min/max)
- string com options -> select
- array com options -> multiselect/checkbox group

## Fluxo recomendado da tela

1. Carregar GET /schema na abertura da pagina.
2. Montar abas com scope_descriptions:
   - billing
   - payment
   - enrollment
3. Para cada campo do schema[scope], preencher valor com settings[scope][key].
4. Salvar apenas o escopo atual:
   - PUT /{scope}
   - body: { "values": { ... } }
5. Restaurar escopo:
   - POST /{scope}/reset
6. Recarregar GET /schema apos salvar/reset.

## Filtro por provedor (ja vem do backend)

No escopo payment:
- schema.payment.enabled_methods.options ja vem filtrado pelo default_provider do tenant
- schema.payment.default_method.options tambem vem filtrado
- defaults.payment.default_method vem coerente com o filtro

Exemplo pratico:
- default_provider = cora
- opcoes de metodo permitidas no schema: pix, boleto

## Erros esperados

- 403: sem permissao
- 404: scope invalido ou tenant nao encontrado
- 422: validacao de payload/regra de negocio

## Checklist rapido

- [ ] consumir GET /schema na entrada
- [ ] renderizar campos por schema
- [ ] usar settings (flat) para value dos inputs
- [ ] salvar por escopo com PUT /{scope}
- [ ] reset por escopo com POST /{scope}/reset
- [ ] recarregar schema apos alteracoes
- [ ] tratar 403/404/422
