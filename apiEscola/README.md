<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## IA: questoes com imagens

A recriacao sem imagem conserva o endpoint e o fluxo existentes. Com `image_url`,
o backend analisa o arquivo original, recria o conteudo com um Image Spec, gera
uma nova imagem via OpenRouter e, por padrao, verifica sua coerencia por visao.
A aprovacao humana continua obrigatoria; a validacao por IA nao e garantia
matematica ou pedagogica.

- Credenciais: as mesmas chaves criptografadas do tenant; super admin prioriza o ambiente
  e, sem chave global disponivel (do provedor exigido, quando houver), usa a chave ativa
  da escola selecionada. Usuarios comuns nunca usam chaves globais ou de outra escola.
  O pipeline com imagem exige OpenRouter, mesmo se o provedor preferido de texto for OpenAI.
- Configuracao central em [config/services.php](./config/services.php), variaveis
  de exemplo em [.env.example](./.env.example).
  `OPENROUTER_VISION_MODEL` seleciona visao; `OPENROUTER_IMAGE_MODEL` seleciona
  imagem (padrao: `google/gemini-3.1-flash-image-preview`, pago).
- `IMAGE_ALLOW_PAID_PRIMARY=true` autoriza o principal pago. Os fallbacks de
  `OPENROUTER_VISION_FREE_FALLBACKS` e `OPENROUTER_IMAGE_FREE_FALLBACKS` sao listas
  separadas por virgulas: no maximo tres modelos, cuja gratuidade e capability
  sao verificadas no catalogo antes da chamada. Nunca ha fallback pago automatico.
  O provider escolhido tambem e fixado com `allow_fallbacks=false`.
- `IMAGE_MULTIMODAL_VALIDATION=true` habilita validacao auxiliar.
  `IMAGE_GENERATION_MAX_RETRIES=2` permite duas regeneracoes apos a primeira
  tentativa (limite de configuracao: 0 a 3). `IMAGE_GENERATION_TIMEOUT=120`
  controla o timeout de cada chamada de imagem.
- Arquivos: reutiliza o disco e os diretorios de uploads do tenant, limitado a
  PNG/JPEG/WebP/GIF, 5 MB e 4096 pixels por dimensao. Base64 nao entra no MySQL.
  URLs externas, caminhos de outro tenant e SVG nao sao lidos: envie a imagem
  original pelo upload da plataforma. O disco deve permitir leitura pelo backend.
- Auditoria: `question_image_generations` registra analise, rascunho, spec,
  modelo, prompt/version, arquivo, status, tentativas, duracao e uso/custo
  retornado pelo provedor. Arquivos de tentativas e rascunhos descartados sao
  mantidos para auditoria; a politica de retencao deve ser definida na operacao.
  `image_url` da questao aprovada permanece compativel com painel e mobile.

Endpoints (autenticados, equipe e tenant):

1. `POST /api/question-bank/questions/{question}/ai/similar`: conserva
   `body.questions`. Sugestoes com imagem acrescentam `generation_id`,
   `image_url` e `image_generation` (status, modelo, tentativas, validacao e motivo).
2. `POST /api/question-bank/ai/image-generations/{generation}/regenerate`:
   recebe `content` (`type`, `question_text`, `explanation`, `options`) e
   `instructions` opcional (ate 500 caracteres). Regenera somente a imagem;
   se dados essenciais foram editados, atualiza o spec primeiro.
3. `POST /api/question-bank/questions`: ao aprovar uma imagem de rascunho,
   envie tambem `generation_id`. A API verifica tenant, estado `READY`, URL
   e correspondencia com o conteudo gerado; vincula a geracao uma unica vez.

Falhas de geracao ou incoerencias retornam `NEEDS_REVIEW`, visivel no painel.
Imagem original inadequada retorna erro com `body.status=NEEDS_REVIEW`.
Nenhuma questao e criada automaticamente. Editar enunciado, alternativas ou
gabarito invalida a correspondencia da imagem; regenere antes de aprovar.

**MVP sincrono:** nao exige worker. Cada questao pode exigir varias chamadas
ao provedor; lotes grandes podem ultrapassar os limites PHP/proxy da hospedagem.
Prefira uma questao por pedido e ajuste os limites operacionais. A espera do painel
(15 minutos apenas no pipeline de imagem) nao aumenta o timeout do servidor.
Falhas de rede no painel nao garantem cancelamento da chamada/cobranca no provedor.

Deploy: aplicar a migration reversivel, configurar as variaveis no servidor,
executar `composer dump-autoload -o` se necessario e `php artisan optimize:clear`.
Nao ha dependencias PHP/SDK novas. A migration de producao nao e executada pelos testes.

Testes:

```bash
php vendor/bin/phpunit -c phpunit.mysql.xml tests/Feature/QuestionImageTest.php tests/Feature/QuestionAiTest.php tests/Feature/QuestionBankTest.php
php vendor/bin/phpunit tests/Unit/AiModelRouterTest.php tests/Unit/QuestionImageSpecTest.php tests/Unit/ExamQuestionCompleteTest.php
```

A configuracao MySQL usa exclusivamente `appescola_test` e recria suas tabelas.
Nao aponte testes `RefreshDatabase` para dados reais.

No painel, a tela **Nova questao** oferece **Autocompletar com IA** no cabecalho:
o botao fica sempre visivel e orienta ao clicar quando faltar chave ou a consulta
de status falhar. A geracao exige enunciado com pelo menos 15 caracteres e chave configurada. Sugere os campos
restantes, preserva textos de alternativas e explicacao ja preenchidos, e nunca
salva automaticamente. Revise as sugestoes e confirme pelo botao de salvar.
**Gerar similares com IA** tambem permanece visivel na edicao, classificacao e
menu da listagem de questoes salvas, com a mesma orientacao de indisponibilidade.
Na criacao e edicao, as acoes de IA ficam no cabecalho, sem botoes duplicados no
conteudo. A edicao carrega e permite alterar a classificacao junto com o conteudo.
O autocompletar preenche alternativas/gabarito e classificacao tambem na edicao,
preservando textos e campos de classificacao ja preenchidos. Conteudo e alteracoes
de classificacao sao salvos juntos pelo endpoint existente de questao avulsa.

Testes visuais com servidor Expo web e API simulada, sem cobrancas:

```bash
cd ../painelEscola
PANEL_TEST_URL=http://localhost:8081 npx playwright test tests/questionAiUi.spec.ts tests/questionImageReview.spec.ts --project=chromium
```

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework.

In addition, [Laracasts](https://laracasts.com) contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

You can also watch bite-sized lessons with real-world projects on [Laravel Learn](https://laravel.com/learn), where you will be guided through building a Laravel application from scratch while learning PHP fundamentals.

## Agentic Development

Laravel's predictable structure and conventions make it ideal for AI coding agents like Claude Code, Cursor, and GitHub Copilot. Install [Laravel Boost](https://laravel.com/docs/ai) to supercharge your AI workflow:

```bash
composer require laravel/boost --dev

php artisan boost:install
```

Boost provides your agent 15+ tools and skills that help agents build Laravel applications while following best practices.

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
