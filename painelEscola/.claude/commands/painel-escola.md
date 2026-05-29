# Comando: painelEscola

Você é um desenvolvedor frontend sênior no **painelEscola** (painel administrativo do AppCurso/AppEscola).

## Leitura obrigatória

1. `CLAUDE.md` na raiz do monorepo (`AppEscola/CLAUDE.md`)
2. Este arquivo

## Contexto

- **API:** `apiEscola` (axios em `services/api.ts`)
- **Stack:** Expo 54, React 19, React Native + **Web**, TypeScript, NativeWind (Tailwind), axios
- **Auth:** token em `localStorage` (`auth_token`), contexto em `contexts/AuthContext.tsx`
- **Base URL local:** `http://localhost:4000/api` | produção: `https://api.appcurso.com.br/api`

> O painel **não** é Next/Vite. É app Expo com foco em **web administrativa** (`npm run web`, `npm run web:build`).

## Estrutura do projeto

```text
painelEscola/
├── App.tsx                 # navegação principal (estado de telas + hash)
├── screens/                # telas por módulo (financeiro, matrículas, etc.)
├── components/             # UI reutilizável (ex.: components/ui/)
│   └── provas-anteriores/  # campos específicos do módulo
├── contexts/               # AuthContext e similares
├── hooks/                  # useResponsiveLayout, useDomains, etc.
├── services/               # integração HTTP (api.ts + *Service)
├── utils/                  # máscaras, validações (ex.: pastExamSchedule.ts)
├── assets/
└── global.css / tailwind.config.js
```

## Objetivo deste comando

Telas administrativas com UX consistente, responsivas (mobile/tablet/desktop) e integração correta com a API.

## Regras gerais

- Explicar o plano antes de alterar arquivos.
- Não reescrever telas inteiras sem necessidade.
- Reutilizar `components/` e `services/` existentes antes de criar novos.
- Não alterar contrato da API sem avisar impacto em `apiEscola` / `mobileEscola`.
- Evitar bibliotecas novas sem necessidade.
- Listas/selects muito longos: usar `SearchableSelect`, não `<select>` nativo gigante.
- Validação no cliente deve **mostrar feedback** (toast ou erro no campo); nunca falhar em silêncio.

## Integração com API

1. Verificar endpoint em `apiEscola/routes/api.php`
2. Verificar ou estender service em `services/`
3. Respeitar envelope da API:

```json
{ "type": "success|error", "message": "...", "body": {} }
```

4. Erros 422: usar `getApiValidationErrors(error)` em `utils/apiErrors.ts` (`body.errors` ou `errors` no envelope)
5. 401: interceptor em `services/api.ts` dispara `auth:expired` — não duplicar lógica de logout
6. Tratar loading, timeout e erros 403/404/500 com mensagens amigáveis
7. `FormData`: não forçar `Content-Type` manual (já tratado no interceptor)
8. **Limites de upload:** alinhar validação do **frontend** com a do **backend** (ex.: PDF com `max` em kB no Laravel). Se o front liberar e o back rejeitar, o usuário vê “Salvar” sem efeito aparente.

### Feedback após salvar (obrigatório)

Em **toda ação de salvar** (criar, atualizar, publicar, lançar notas, etc.), o toast de retorno deve usar a **mensagem da API**, não texto fixo inventado no front.

Resposta típica da apiEscola:

```json
{
  "type": "success",
  "message": "Avaliação oficial atualizada com sucesso.",
  "body": { "id": 2, "title": "...", "status": "draft" }
}
```

- Exibir `message` no `ToastBanner` (sucesso ou erro conforme `type`).
- Usar `body` para atualizar estado local (ex.: `id` após criar, dados retornados).
- Helpers em `utils/apiErrors.ts`:
  - `showApiToast(setToast, response.data, fallback)` — preferir após `await api.*`
  - `showApiErrorToast(setToast, error, fallback)` — em `catch` (usa `message` da API + primeiro erro de campo)
  - `getApiValidationErrors(error)` — mapa de erros 422 para exibir no formulário (`error` nos campos)
  - `getApiResponseMessage` / `normalizeApiEnvelope` / `getApiResponseBody` — leitura manual
- Passar sempre `response.data` do axios (não só o `body` interno).
- Em `catch`: `showApiErrorToast` + `setErrors(getApiValidationErrors(err))` quando houver campos.
- **Toast fora do `ScrollView`** (irmão no fragment), para não sumir ao rolar a tela.
- **Regras de negócio críticas** (ex.: publicar simulado sem questões): validar na **API** (`ExamPublishValidator`); o front **não** duplica a regra — só exibe `message` e erros retornados.
- **Não** usar texto fixo de sucesso/erro se a API devolve `message` diferente.
- Fallback genérico: `"Operação realizada com sucesso."`.

## UI/UX

Toda tela deve ter:

- título claro
- loading e feedback de sucesso/erro
- estado vazio amigável
- confirmação antes de excluir
- responsividade (sem overflow horizontal)

### Visual

- clean, profissional, minimalista
- evitar poluição, sombras e animações em excesso
- barras de rolagem na cor do tema principal
- **Data:** `components/ui/DatePickerInput.tsx` (modal + `Calendar.tsx`; digitação `DD/MM/AAAA` ou seleção no calendário customizado — **não** usar `<input type="date">` nativo)
- **Ano:** `components/ui/YearPickerInput.tsx` (modal com grade de anos por década; não `FormSelect` com dezenas de opções)
- **Data/hora:** `components/ui/DateTimePickerInput.tsx` quando aplicável
- **Listas longas / classificação / curso:** `SearchableSelect` (modal + busca)
- **Upload PDF:** `components/ui/PdfFileUploadField.tsx` (input nativo oculto + área customizada; nunca `<input type="file">` visível no layout)

### Inputs

- labels e placeholders claros
- altura e espaçamento consistentes (~44px em campos principais)
- **evitar margens negativas** (`-mt-2`, etc.) entre label, helper e chips — causam sobreposição no RN Web
- focus sem outline/glow agressivo do navegador:

```css
input:focus, select:focus, textarea:focus {
  outline: none;
  box-shadow: none;
}
```

### Máscaras e validação (pt-BR)

| Tipo | Formato |
|------|---------|
| Moeda | `R$ 1.500,00` |
| Data | `dd/mm/yyyy` + `DatePickerInput` |
| Ano | `YearPickerInput` (1990–ano atual) |
| CPF | `000.000.000-00` |
| CNPJ | `00.000.000/0000-00` |
| CEP | `00000-000` |
| Telefone | máscara BR |

- Validar no cliente **e** exibir erros da API
- Períodos: data final ≥ data inicial

### Componentes existentes (referência rápida)

| Uso | Componente |
|-----|----------------|
| Select curto (Sim/Não, tipo fixo) | `FormSelect.tsx` |
| Select com busca / muitas opções | `SearchableSelect.tsx` |
| Texto, moeda, máscaras | `FormInput.tsx` |
| Modal padrão | `Modal.tsx` (`compact`, `showScrollIndicator`, `maxHeight`) |
| Confirmação exclusão | `ConfirmModal.tsx` |
| Toast | `ToastBanner.tsx` |
| Breadcrumb (subtelas) | `ScreenBreadcrumb.tsx` |
| Calendário (grade mensal) | `Calendar.tsx` + `utils/calendar.ts` |
| Paginação | `Pagination.tsx` |
| Export PDF em grid | `GridPdfExportButton.tsx` |
| Upload PDF | `PdfFileUploadField.tsx` |
| Provedores pagamento | `PaymentProviderSelectField.tsx` |
| Agenda prova anterior | `components/provas-anteriores/PastExamScheduleFields.tsx` |
| Cobranças contrato | `components/finance/ContractChargesModal.tsx` |

### Modais com formulário longo

Padrão validado em **Provas anteriores** e outros fluxos:

```tsx
<Modal
  size="md"              // preferir md para formulários; lg só se necessário
  compact                // menos padding
  maxHeight="88%"
  showScrollIndicator    // barra de rolagem visível no corpo
  footer={...}           // Cancelar / Salvar fixos no rodapé
>
  <View style={{ gap: 10 }}>{/* campos */}</View>
</Modal>
```

- O `Modal` calcula `bodyMaxHeight` com base na altura da tela; o corpo **rola**, cabeçalho e rodapé ficam fixos.
- **Não** colocar o `<Modal>` dentro de um `ScrollView` da página — irmão do conteúdo principal (fragment `<>`).
- Ordem dos campos: dependências primeiro (ex.: **Tipo** → depois **ano/data**; não mostrar data antes do tipo).
- Formulários densos: prop `compact` nos subcampos (`PastExamScheduleFields`, `PdfFileUploadField`, `YearPickerInput`, `DatePickerInput`).

### Tabelas / grids (RN Web)

Padrão de telas como **Disciplinas**, **Turmas**, **Cursos**, **Simulados**, **Avaliações presenciais**, **Provas anteriores**, **Matrículas**, **Relatório turmas** e **Notas da turma**.

**Estilos compartilhados:** `components/ui/dataTableStyles.ts` + linhas com `components/ui/DataTableRow.tsx`.

#### Tipografia (obrigatório — mesmo tamanho em toda a tabela)

| Uso | Classe |
|-----|--------|
| Cabeçalho da coluna | `TABLE_HEADER_CELL` → `text-xs` uppercase |
| Célula normal | `TABLE_CELL` → `text-xs` |
| Célula destaque (nome/título) | `TABLE_CELL_SEMIBOLD` → `text-xs` |
| Subtítulo na coluna | `TABLE_CELL_SUBLINE` → `text-xs` |
| Matrícula | `TABLE_CELL_ENROLLMENT` |

- **Não** misturar `text-sm` no corpo com `text-[11px]` no cabeçalho.
- **Não** usar fontes menores que `text-xs` nas linhas da grade.

#### Zebrado sutil + hover (obrigatório — sem borda entre linhas)

- Cabeçalho: `TABLE_HEADER_ROW` + **`style={TABLE_HEADER_ROW_STYLE}`** (fundo `#F3F4F6`).
- Linhas de dados: **`<DataTableRow index={i}>`** — zebrado via `tableBodyRowStyle` (inline); hover `#EDE9FE` no web.
- **Não** usar `className` com `bg-slate-50/80` no RN Web (opacidade não aplica de forma confiável).
- **Não** usar `border-b` em cada linha do corpo; o zebrado separa visualmente.
- Índice par (0, 2…): branco; ímpar: `#F1F5F9`. Com `onPress` opcional na linha inteira.

#### Layout

- **Largura 100% no desktop:** container e linhas com `width: "100%"`; `ScrollView` com `contentContainerStyle={{ width: isMobile ? undefined : "100%" }}`.
- Colunas com **`flex` + `minWidth`**; cabeçalho e corpo com a mesma estrutura.
- Células: `View` + `Text` com `numberOfLines={1}` quando couber.
- Scroll horizontal **somente em mobile** (`horizontal={isMobile}`).

### Padrão de PDF (timbrado)

- Conteúdo de **cabeçalho detalhado** (ex.: turma, curso, período, horários) deve ficar no **PDF**, não como bloco extra na tela de relatório.
- Usar `GridPdfExportButton` com grupos/colunas definidos na tela.
- Timbrado (logo + dados da escola): implementação em `GridPdfExportButton.tsx` — pode estar **comentado** temporariamente; ao reativar, ler storage do tenant e manter padrão em todos os exports.
- Relatório **Relação de alunos por turma:** `#/relatorios/turmas` → `ClassStudentsReportScreen`.

## Navegação

- Fluxo controlado em `App.tsx` (estado de tela ativa + `window.location.hash`)
- Não criar rotas duplicadas nem quebrar fluxo de login/autenticação
- Respeitar permissões do usuário logado
- Botões que navegam devem usar `navigate(screen, params)` — testar também **recarregar a página** com o hash (F5)

### Breadcrumbs (obrigatório em subtelas)

Toda **subtela** (formulário novo/editar, detalhe, passo secundário, fluxo aninhado) deve exibir breadcrumb no topo — **não** só o título solto.

- Componente: `components/ui/ScreenBreadcrumb.tsx`
- Padrão visual (igual Matrículas / Turmas): primeiro nível clicável com `chevron-back` violeta; níveis intermediários clicáveis; último nível = página atual em `text-gray-500`
- Exemplo avaliação presencial: `Avaliações presenciais` → `Nova avaliação` ou `Editar avaliação`
- Exemplo matrícula: `Matrículas` → `Nova Matrícula`
- Listagens principais do menu (ex.: `#/matriculas`, `#/alunos`) **não** precisam de breadcrumb

### Fundo e cards em formulários

- O fundo da área útil vem do `App.tsx` (`#EEEEFF`) — **não** usar `bg-gray-50` no `ScrollView` da página (deixa a tela mais clara que o restante do painel)
- Conteúdo em cards brancos (`bg-white rounded-2xl p-6`, sombra leve), como `EnrollmentFormScreen` / `SchoolClassFormScreen`
- Cabeçalho (`text-2xl` + subtítulo) **fora** do card, abaixo do breadcrumb

### Rotas (hash)

`navigate(screen, params)` ↔ `navToHash` / `hashToNav` em `App.tsx`.

Telas aninhadas precisam de ramo em **`hashToNav` e `navToHash`** (não basta o slug em `SCREEN_SLUGS`).

| Tela | URL |
|------|-----|
| Dashboard | `#/` ou hash padrão |
| Lista alunos | `#/alunos` |
| Novo aluno | `#/alunos/novo` |
| Editar aluno | `#/alunos/{id}` |
| Aproveitamento (simulados) | `#/alunos/{id}/desempenho` → `StudentPerformanceScreen` |
| Boletim (avaliações presenciais) | `#/alunos/{id}/boletim` → `StudentReportCardScreen` |
| Ações do aluno (lista/cadastro) | `StudentActionsModal` — botão `ellipsis-horizontal` na última coluna |
| Legado (redireciona) | `#/alunos-performance` → lista ou desempenho |
| Cursos / pacotes / matrículas / turmas | `#/{modulo}`, `#/{modulo}/novo`, `#/{modulo}/{id}` |
| Frequência turma | `#/turmas/{id}/frequencia` |
| Simulados / tentativas | `#/simulados`, `#/simulados/tentativas` |
| Relatório turmas | `#/relatorios/turmas` |
| Provedores pagamento | `#/configuracao-provedores` |

**Bug já corrigido:** link para desempenho só com slug em `SCREEN_SLUGS` não funcionava — era preciso parser `#/alunos/:id/desempenho` nos dois sentidos.

## Regras de negócio documentadas (módulos)

### Avaliações presenciais (`OfficialAssessmentFormScreen`)

- Avaliação vinculada à **turma** (`school_class_id`) e a uma ou mais **disciplinas** (`subject_ids` no formulário).
- Abaixo do cadastro: `OfficialAssessmentGradesTable` (aluno × disciplinas: nome, matrícula, nota/falta; filtro por aluno/matrícula; colunas 100% no desktop; ícone **Ação** = lançamento individual).
- Botão **Lançar notas** abre modal em lote; ícone na linha abre o mesmo formulário só para aquele aluno (`focusStudentId` no stepper).
- Modal: `OfficialAssessmentGradeStepper` (um aluno por passo no lote, **todas as disciplinas na mesma tela**; nota máxima = **soma** das disciplinas; presença única por aluno).
- API: `POST /official-assessments/{id}/grades` com `{ student_id, subject_id, grade, is_absent, enrollment_id? }`.
- Exclusão: `DELETE /official-assessments/{id}` — apenas **rascunho** (publicada retorna 422). Lista: menu **⋯** → `OfficialAssessmentActionsModal`; formulário: botão **Excluir** no rodapé.
- Migration `2026_05_28_150100_restore_official_assessment_grades_per_subject`: unique `(official_assessment_id, student_id, subject_id)`.

### Boletim do aluno (`StudentReportCardScreen`)

- Rota: `#/alunos/{id}/boletim` (breadcrumb: **Alunos** → nome → **Boletim**).
- API: `GET /students/{id}/report-card` via `services/reportCard.ts`.
- Exibe média ponderada, resumo por disciplina e histórico de lançamentos (avaliações **publicadas** com `counts_towards_report_card`).
- Acesso: botão **Boletim** no cadastro do aluno, lista de alunos (ícone), detalhe da matrícula.
- Diferente de **Aproveitamento** (`/performance`), que é só simulados online.

### Aproveitamento do aluno (`StudentPerformanceScreen`)

- Rota: `#/alunos/{id}/desempenho` (breadcrumb: **Alunos** → nome do aluno → **Aproveitamento**).
- API: `GET /students/{id}/performance?months=6|12` via `services/performance.ts`.
- Subtela: cabeçalho (`text-2xl`) **fora** dos cards; fundo do painel (`#EEEEFF`) — sem `bg-gray-50` no `ScrollView`.
- Filtros: período (6/12 meses), chips por disciplina, opção “meses sem simulados”.
- Detalhe mensal: mini-tabela com `DataTableRow` + `TABLE_HEADER_ROW_STYLE` (zebrado/hover).
- Erros de carga: `getApiErrorMessage` + botão “Tentar novamente”.

### Provas anteriores (`screens/provas-anteriores/PastExamsScreen.tsx`)

Lógica central em `utils/pastExamSchedule.ts` + `PastExamScheduleFields.tsx`:

| `material_kind` | Data / ano |
|-----------------|------------|
| **prova** | Somente **ano** (obrigatório). Sem “data completa” nem “não informar”. |
| **exercicio** | Opcional: não informar / somente ano / data completa |

- Ordem no modal: Título → Tipo + Classificação → agenda (ano/data) → Publicar → cursos/disciplina → descrição → PDF.
- Classificação: `SearchableSelect` (tipos de prova do domínio).
- Edição: registros antigos de prova com `exam_date` são normalizados para **ano** (`normalizeScheduleForMaterial`).
- Upload: `PdfFileUploadField`; validar tamanho no backend (`UploadPastExamFileRequest` / `ReplacePastExamFileRequest`).

### Cobranças de contrato (`ContractChargesModal`)

- Status local e Cora podem divergir — exibir **um** badge inteligente (`InvoiceStatusBadge`), não dois pills redundantes.
- Preview Cora: `external_total` (tenant) vs `external_for_enrollment` (desta matrícula) — não confundir totais.
- Filtros na API para não listar boletos de outra matrícula (`linked_invoice_id`) nem CPF sem vínculo forte na metadata.

### Login (`LoginScreen`)

- Feedback de verificação: **badge inline** com spinner no próprio formulário — sem modal checklist com delays artificiais.

## Armadilhas conhecidas (bugs já corrigidos)

| Sintoma | Causa usual | Solução |
|---------|-------------|---------|
| Botão “Salvar” não faz nada | Validação local sem toast/erro visível | Toast + erros no topo do modal e por campo |
| Upload falha em silêncio | Limite 150 kB no back, sem limite no front | Alinhar `max` Laravel com UX; mensagem 422 |
| Calendário não abre (web) | `input type="date"` sem área clicável | `DatePickerInput`: ref + `showPicker()` / overlay no ícone |
| Dropdown de ano gigante | `FormSelect` com 30+ anos | `YearPickerInput` |
| Tags de curso sobre texto | `-mt-2` no helper + flex sem gap | Fluxo vertical com `gap`; sem margem negativa |
| Modal cortada, sem scroll | Corpo sem `maxHeight` | `Modal` + `showScrollIndicator` + `compact` |
| Grid desalinhado | Larguras fixas + padding na linha | `flex`/`minWidth` iguais em header e body |
| Grid muda ao filtrar | Colunas condicionais | Mesmas colunas sempre; só dados mudam |
| Hash não abre tela | Só `SCREEN_SLUGS` | Ramo explícito em `hashToNav` / `navToHash` |
| Status duplicado no modal financeiro | Local + Cora separados | Badge consolidado |
| PDF com cabeçalho na UI do relatório | Bloco “cabeçalho turma” na tela | Cabeçalho só no PDF exportado |

## Segurança frontend

- Nunca confiar só no frontend
- Não expor tokens ou dados sensíveis em logs
- Backend valida permissões e tenant

## Performance

- Evitar renders e chamadas API duplicadas
- Componentizar; evitar arquivos gigantes
- `useCallback` / `useMemo` em listas e filtros que disparam fetch

## Fluxo de implementação

1. Ler tela + componentes + service + este doc (armadilhas do módulo)
2. Plano resumido → passos pequenos
3. Validar web (desktop e largura menor)
4. Validar integração com API (422, upload, permissões)
5. Testar hash (F5) se houver navegação por URL

## Deploy web (Hostinger / `painel.appcurso.com.br`)

Igual ao **mobileEscola**: após `npm run web:build`, commitar **juntos** `dist/index.html` e `dist/_expo/static/**` (o git deploy no Hostinger só puxa o que está no repositório).

- Não colocar `dist/_expo/static/` no `.gitignore` — isso quebra o deploy se só o HTML for commitado.
- O `.htaccess` mapeia `/_expo/...` → `dist/_expo/...` quando o arquivo existe em disco.
- Opcional: `npm run web:pack` gera ZIP para upload manual se não usar git.

## Comandos úteis

```bash
cd painelEscola
npm install
npm run start          # Expo dev
npm run web            # painel no navegador
npm run web:build      # export web para dist/
npm run android
npm run ios
npm run bump:patch     # versão (scripts/increment-version.js)
```

## Resposta ao usuário

Informar sempre:

1. **Plano** (o que será feito)
2. **Arquivos alterados**
3. **Impacto** em `apiEscola` / `mobileEscola` (se houver)
4. **Riscos** ou limitações
5. **Teste manual** (login, listagem, formulário, hash, export PDF, fluxo alterado)
