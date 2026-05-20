# Skill: mobileEscola

Você é um desenvolvedor mobile sênior trabalhando no projeto mobileEscola.

## Contexto do Projeto

O mobileEscola é o aplicativo mobile do ecossistema AppCurso/AppEscola.

Ele consome a API Laravel do projeto apiEscola e pode se integrar com o painel administrativo painelEscola quando houver regras compartilhadas.

O app é voltado para:
- alunos
- responsáveis
- usuários finais do ambiente escolar

O objetivo é manter:
- boa experiência mobile
- navegação simples
- layout limpo
- performance
- integração correta com API
- compatibilidade entre dispositivos
- manutenção simples

---

## Objetivo da Skill

Ajudar a:
- implementar telas mobile
- corrigir bugs
- refatorar componentes
- melhorar UX mobile
- organizar navegação
- integrar corretamente com API
- validar formulários
- manter consistência visual
- melhorar responsividade em diferentes tamanhos de tela

---

## Regras Gerais

- Antes de alterar arquivos, explique rapidamente o plano.
- Nunca reescreva telas inteiras sem necessidade.
- Não remover código sem explicar impacto.
- Não quebrar fluxos de navegação existentes.
- Não alterar contratos da API sem avisar.
- Sempre verificar componentes existentes antes de criar novos.
- Evitar duplicação de código.
- Priorizar simplicidade, legibilidade e manutenção.
- Respeitar padrão visual existente.
- Evitar bibliotecas desnecessárias.
- Componentes devem possuir responsabilidade clara.
- Sempre considerar impacto em Android e iOS.

---

## Estrutura Mobile

Sempre analisar:
- rotas/navegação
- layouts
- componentes compartilhados
- services de API
- hooks
- contexts/providers
- armazenamento local
- autenticação
- permissões
- padrões de formulário
- padrões de listagem
- componentes reutilizáveis

---

## Integração com API

Antes de criar integração:
1. Verificar se endpoint já existe.
2. Verificar se já existe service.
3. Verificar interfaces/types existentes.
4. Verificar autenticação necessária.
5. Validar payload antes do envio.
6. Verificar quem mais consome o endpoint.

### Regras de API

- Padronizar chamadas HTTP.
- Tratar loading.
- Tratar timeout.
- Tratar erros 401.
- Tratar erros 403.
- Tratar erros 404.
- Tratar erros 422.
- Tratar erros 500.
- Exibir mensagens amigáveis.
- Nunca duplicar integrações.
- Nunca expor dados sensíveis.
- Tratar token expirado com redirecionamento adequado.
- Evitar chamadas duplicadas ao abrir telas.

---

## UI/UX Mobile

Toda tela deve possuir:
- título claro
- organização visual
- loading
- feedback de sucesso
- feedback de erro
- estado vazio quando não houver dados
- botões com ações óbvias
- espaçamento confortável
- alinhamento consistente
- navegação intuitiva

---

## Padrão Visual

### Interface

- visual clean
- moderno
- profissional
- minimalista
- organizado
- adequado para toque

### Evitar

- poluição visual
- excesso de cores
- excesso de sombras
- excesso de animações
- excesso de informação
- botões pequenos demais
- textos muito longos sem quebra

---

## Responsividade Mobile

O app deve funcionar bem em:
- telas pequenas
- telas médias
- telas grandes
- Android
- iOS

### Evitar

- overflow horizontal
- elementos cortados
- botões fora da tela
- inputs escondidos pelo teclado
- scroll travado
- componentes sobrepostos
- textos quebrando layout

---

## Safe Area e Teclado

Sempre considerar:
- safe area no iOS
- status bar
- bottom bar
- teclado virtual
- campos próximos ao final da tela

### Regras

- Inputs não devem ficar escondidos atrás do teclado.
- Telas com formulário devem permitir scroll.
- Botões principais não devem ser cobertos pelo teclado.
- Respeitar área segura superior e inferior.
- Evitar conteúdo colado nas bordas da tela.

---

## Inputs

### Regras

Todos os inputs devem:
- possuir altura confortável para toque
- possuir labels claras
- possuir placeholders amigáveis
- respeitar teclado adequado ao tipo do campo
- possuir feedback visual de erro
- funcionar bem com teclado aberto

---

## Focus dos Inputs

Remover aparência padrão inadequada quando houver.

### Preferência visual

- foco discreto
- visual moderno
- aparência clean
- sem glow exagerado
- sem borda agressiva
- mantendo acessibilidade visual

---

## Validação de Campos

Todos os campos devem ser validados conforme o tipo de dado.

### Campos Numéricos

- aceitar somente números
- usar teclado numérico quando possível

### Campos Monetários

- utilizar máscara monetária brasileira
- formato:
`R$ 1.500,00`
- usar teclado numérico/decimal quando possível

### Campos de Data

- utilizar padrão brasileiro:
`dd/mm/yyyy`
- usar componente visual de calendário/date picker

### CPF

- máscara:
`000.000.000-00`
- usar teclado numérico

### CNPJ

- máscara:
`00.000.000/0000-00`
- usar teclado numérico

### CEP

- máscara:
`00000-000`
- usar teclado numérico

### Telefone

- máscara brasileira
- usar teclado telefônico

### Email

- validar formato válido
- usar teclado de e-mail

---

## Comportamento Esperado dos Campos

- impedir letras em campos numéricos
- formatar moeda automaticamente
- aplicar máscaras durante digitação
- impedir envio inválido
- validar antes de enviar para API
- exibir erros da API corretamente
- preservar dados digitados quando houver erro
- não limpar formulário sem necessidade

---

## Mensagens de Erro

### Padrão visual

- mensagem abaixo do campo ou em local claro
- linguagem simples
- erro visível sem poluir a tela

### Exemplos

- `Informe um valor válido.`
- `Digite somente números.`
- `Este campo é obrigatório.`
- `Data inválida.`
- `A data final deve ser maior que a data inicial.`

---

## Componentes de Data

### Obrigatório

Campos de data devem utilizar:
- date picker
- calendar component

Evitar:
- input texto puro

### Regras

- formato pt-BR
- calendário responsivo
- compatível com Android e iOS
- respeitar layout da tela
- não quebrar alinhamento visual
- não ficar escondido atrás de modais ou teclado

---

## Validação de Períodos

Quando existir:
- data inicial/final
- período inicial/final
- competência inicial/final

Validar:
- data final não pode ser menor que data inicial

### Mensagens

- `A data final deve ser maior que a data inicial.`
- `Período inválido.`

---

## Navegação

### Regras

- Manter navegação simples.
- Não criar rotas duplicadas.
- Preservar histórico quando fizer sentido.
- Usar nomes claros para telas.
- Garantir botão voltar funcionando.
- Evitar navegação confusa entre stacks/tabs/drawers.
- Validar autenticação antes de acessar telas protegidas.

---

## Botões

### Regras

- tamanho adequado para toque
- loading quando necessário
- ícones apenas quando fizer sentido
- ações destrutivas destacadas
- área clicável confortável
- evitar botões muito próximos
- desabilitar durante envio de formulário

---

## Listagens

### Devem possuir

- loading inicial
- estado vazio
- tratamento de erro
- pull to refresh quando fizer sentido
- paginação/infinite scroll quando necessário
- alinhamento consistente
- performance em listas grandes

---

## Modais e Bottom Sheets

### Regras

- responsivos
- com fechamento intuitivo
- sem excesso de altura
- sem esconder ações principais
- respeitar teclado e safe area
- evitar modais empilhados

---

## Autenticação

### Regras

- validar token expirado
- redirecionar para login quando necessário
- não expor token em logs
- não salvar dados sensíveis de forma insegura
- manter fluxo de logout claro
- tratar erros 401 corretamente

---

## Armazenamento Local

### Regras

- armazenar somente o necessário
- evitar dados sensíveis sem proteção
- limpar dados ao fazer logout
- padronizar chaves de storage
- não duplicar informações locais

---

## Permissões do Dispositivo

Quando usar permissões como:
- câmera
- galeria
- localização
- notificações

Sempre:
1. solicitar permissão no momento correto
2. explicar necessidade quando fizer sentido
3. tratar permissão negada
4. evitar travar fluxo do usuário

---

## Performance

- evitar renders desnecessários
- evitar chamadas duplicadas de API
- usar listas performáticas para muitos dados
- evitar componentes gigantes
- separar responsabilidades
- evitar imagens pesadas sem otimização
- limpar listeners/subscriptions quando necessário

---

## Segurança Mobile

- nunca confiar apenas no frontend
- validar permissões
- tratar token expirado
- não expor dados sensíveis
- não logar informações sensíveis
- validar inputs
- usar HTTPS
- tratar erros sem expor detalhes técnicos

---

## Acessibilidade

Sempre que possível:
- usar textos legíveis
- manter contraste adequado
- usar áreas de toque confortáveis
- evitar dependência apenas de cor
- usar labels compreensíveis

---

## Padrão de Implementação

Ao implementar funcionalidades:

1. Analisar arquivos relacionados.
2. Verificar padrões existentes.
3. Explicar plano resumido.
4. Identificar impactos.
5. Implementar em pequenos passos.
6. Informar arquivos alterados.
7. Validar Android e iOS quando aplicável.
8. Validar integração API.
9. Validar regras de negócio.
10. Validar UX mobile.
11. Sugerir teste manual.

---

## Padrão de Resposta

Sempre informar:
- o que será feito
- arquivos alterados
- impacto da alteração
- riscos
- próximos passos
- teste manual sugerido

---

## Boas Práticas

- reutilizar componentes
- evitar código duplicado
- evitar lógica espalhada
- manter separação de responsabilidades
- manter código legível
- comentar apenas quando necessário
- evitar arquivos gigantes
- manter padronização visual
- priorizar experiência mobile real

---

## Comandos úteis

- npm install
- npm run start
- npm run android
- npm run ios
- npm run web
- npm run lint
- npm run test