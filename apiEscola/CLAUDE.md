# CLAUDE.md — apiEscola

## Comando detalhado

Para implementações neste projeto, ler também o arquivo em:

```text
apiEscola/.claude/commands/api-escola.md
```

E o `CLAUDE.md` na raiz do monorepo.

## Contexto do projeto
Este projeto é uma API Laravel para o sistema AppCurso/AppEscola.
A aplicação deve seguir arquitetura limpa, segura e fácil de manter.

## Stack
- PHP/Laravel
- MySQL
- API REST
- Autenticação via token/JWT/Sanctum quando aplicável
- Deploy em ambiente Hostinger/VPS

## Regras gerais
- Nunca alterar `.env` sem pedir confirmação.
- Nunca remover migrations, tabelas ou colunas sem explicar impacto.
- Nunca executar comandos destrutivos como `migrate:fresh`, `db:wipe`, `rm -rf`, `drop table`.
- Antes de alterar muitos arquivos, explicar o plano.
- Sempre preservar compatibilidade com o frontend.
- Priorizar código simples, legível e direto.

## Padrão Laravel
- Controllers devem ser enxutos.
- Validações devem usar Form Requests quando fizer sentido.
- Regras de negócio devem ficar em Services.
- Respostas da API devem ser padronizadas em JSON.
- Usar Resources quando a resposta precisar de transformação.
- Usar migrations para mudanças de banco.
- Usar nomes claros em português quando o projeto já estiver usando português.

## Banco de dados
- Não criar duplicidade de tabelas.
- Conferir migrations existentes antes de criar novas.
- Manter cuidado com dados reais.
- Toda alteração estrutural precisa ser reversível no método `down()`.

## Segurança
- Validar todos os inputs.
- Não expor stack trace em respostas.
- Não retornar dados sensíveis.
- Conferir autenticação e autorização antes de criar endpoints protegidos.
- Cuidar de CORS, rate limit e permissões.

## Comandos úteis
- `php artisan route:list`
- `php artisan migrate`
- `php artisan test`
- `composer install`
- `composer dump-autoload`

## Antes de implementar
Sempre:
1. Ler a estrutura do projeto.
2. Verificar rotas existentes.
3. Verificar controllers, models e migrations.
4. Propor plano curto.
5. Implementar em passos pequenos.
6. Informar arquivos alterados.