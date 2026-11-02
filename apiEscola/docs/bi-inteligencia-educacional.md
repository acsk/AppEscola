# Inteligência Educacional (BI 360°) — Diagnóstico técnico e proposta de arquitetura

> Status: **proposta para validação**. Nada foi implementado. Após aprovação, a implementação começa pela Fase 1.
> Data da análise: 31/10/2026. Projetos analisados: `apiEscola`, `painelEscola`, `mobileEscola`.

---

## 1. Diagnóstico da arquitetura atual

| Item | Situação encontrada |
|------|---------------------|
| Backend | Laravel 12, PHP 8.2+, Sanctum, envelope `type/message/body`, middleware `IdentifyTenant`. `vendor/` versionado (deploy não roda `composer install`). |
| Banco | MySQL 8 (já usa `ROW_NUMBER() OVER` em `LearningDiagnosisService`). Views existentes: `vw_dashboard_tenant_summary`, view do relatório de turmas. |
| Infra assíncrona | `QUEUE_CONNECTION=database`, `CACHE_STORE=database` (sem tags de cache), scheduler ativo em `routes/console.php` (ranking, learning, embeddings). |
| Painel | **Expo 54 / React Native Web** (não é React DOM puro), NativeWind, design system "Cursinho Hub". Gráficos atuais feitos à mão com `View` (`components/dashboard/AttendanceBarChart.tsx`, `FinanceMonthChart.tsx`). `react-native-svg` já é dependência. PDF no cliente com `jspdf` + `jspdf-autotable`. Sem biblioteca de Excel. |
| Mobile | Expo/React Native, já possui feature `desempenho` consumindo `aluno/performance` e `aluno/learning/*`. |
| Autorização | Sem `app/Policies`. Checagem por `in_array($user->role, [...])` em cada controller. Papéis: `super_admin`, `admin`, `secretaria`, `professor`, `aluno`, `responsavel` (**não existe papel de coordenação**). Professor hoje enxerga dados do tenant inteiro. |
| Feature flags / planos | **Não existem.** Há `tenants.settings` (JSON) e `tenant_settings` (`module` + `key` + `value`), já usados com cache em `TenantBillingSettingsService`. IA por tenant: `tenant_ai_credentials.active`. |

### Serviços analíticos já existentes (reaproveitar, não recriar)

| Serviço | O que já calcula |
|---------|------------------|
| `StudentPerformanceService` | Tentativas concluídas de simulados online por aluno, agregação mensal e por disciplina. |
| `Learning\LearningDiagnosisService` | Acerto na **primeira tentativa** do banco de questões por disciplina/assunto, níveis `critical/attention/good/excellent/insufficient` com limites em `config/learning.php` (amostra mínima 5), comparação 30d × 30d anteriores. |
| `PracticePerformanceService` | Score de Wilson, score de dedicação (questões + dias ativos), rankings, escopo por curso, `MIN_SAMPLE = 5`. |
| `AdminDashboardService` | Frequência semanal, tendência mês a mês, resumo do tenant via view. |
| `StudentAcademicHistoryService`, `ExamDeliveryReportService`, `ExamQuestionErrorsReportService`, `ClassStudentsReportService`, `OfficialAssessmentController@studentReportCard` | Histórico, entrega e erros por questão de simulado, relatório de turma, boletim presencial. |
| `PracticeAnswer::scopeCounted()` | Regra oficial de "resposta que conta" (sessão finalizada ou correção imediata). **O BI deve usar este escopo** para não divergir do app. |

---

## 2. Mapeamento das tabelas e relacionamentos

```text
tenants ─┬─ courses ── school_classes ──┬── enrollments ── students ── student_desired_courses ── courses
         │                              ├── enrollment_school_classes (aluno em várias turmas)
         │                              ├── class_schedules ── class_schedule_user (professor) 
         │                              └── student_attendances (present|absent|late|excused, por data)
         ├─ subjects ── subject_topics            subject_user (professor × disciplina)
         │
         ├─ exams (course_id, exam_type_id, origin, starts_at/ends_at) ── exam_course (N:N cursos)
         │    └─ exam_questions (subject_id, exam_type_id, difficulty_id, is_annulled)
         │         ├─ exam_question_topic ── subject_topics
         │         └─ exam_question_options
         │    └─ exam_attempts (student_id, score, max_score, percentage, status, finished_at)
         │         └─ exam_answers (question_id, is_correct, points_earned)
         │
         ├─ official_assessments (school_class_id, kind presencial_*, assessment_date, max_score, weight, exam_type_id)
         │    ├─ official_assessment_subject
         │    └─ official_assessment_grades (student_id, subject_id, grade, is_absent)
         │
         ├─ practice_attempts (kind, filters, correction_mode, finished_at)
         │    └─ practice_answers (exam_question_id, is_correct, answered_at)
         ├─ student_review_items (revisão espaçada: box, next_review_on, history)
         └─ practice_ranking_snapshot_days / _positions

exam_types (GLOBAL, sem tenant): enem, ifal, cpm, …, presencial
```

---

## 3. Fontes de dados — disponíveis e ausentes

### 3.1 Disponíveis

| Necessidade do BI | Fonte | Observação |
|-------------------|-------|-----------|
| Simulados online (nota) | `exam_attempts` (`status=completed`) | `percentage` 0–100 pronto. Várias tentativas por aluno quando `allow_retake` → definir regra (ver §4). |
| Simulados online (por questão/assunto) | `exam_answers` → `exam_questions` → `exam_question_topic` | Permite mapa de calor por assunto. |
| Simulados presenciais | `official_assessments` + `official_assessment_grades` | Nota **por disciplina**, sem questão/assunto. `is_absent` distingue falta de zero. |
| Banco de questões | `practice_answers` (+ `scopeCounted`) | Granularidade por questão, com data. Primeira tentativa já padronizada. |
| Frequência | `student_attendances` | Só existe quando a chamada é lançada. |
| Engajamento (prática) | `practice_answers.answered_at`, `practice_attempts`, `student_review_items` | Dias ativos, regularidade semanal, revisões. |
| Participação em simulados | `exams` publicados × `exam_attempts` | Elegibilidade via `exam_course` + matrícula ativa no curso. |
| Concurso | `exam_types` (em exams, questões, avaliações presenciais) | Global; mistura concurso (`cpm`, `ifal`, `enem`) com modalidade (`presencial`). |
| Objetivo do aluno | `student_desired_courses` → `courses` | Curso desejado, não concurso. |
| Turma do aluno | `enrollments` + `enrollment_school_classes` | Tentativa online não guarda turma: derivar pela matrícula vigente na data. |
| Professor × turma | `class_schedule_user` → `class_schedules.school_class_id`; `subject_user` | Base para restringir o professor às suas turmas. |

### 3.2 Ausentes (e proposta de coleta)

| Dado ausente | Impacto | Proposta | Fase |
|--------------|---------|----------|------|
| **Dias de atividade no app** (login/uso) | Engajamento só enxerga quem pratica questões | Tabela `student_activity_days` (tenant, aluno, data, contadores por origem) com *upsert* leve no middleware autenticado do aluno. **Começar já na Fase 1** para acumular histórico para 2027. | 1 |
| Calendário de aulas previstas | Frequência = presenças / chamadas lançadas (não / aulas previstas) | Documentar a limitação; opcionalmente usar `class_schedules` + calendário para estimar aulas previstas. | 3 |
| Presencial por questão/assunto | Sem mapa de calor de presenciais | Opcional: lançamento de cartão-resposta presencial reaproveitando `exams` (tipo `presencial`) e `ExamAnswerKeyService`. | 3 |
| Metas pedagógicas | Sem "distância da meta" | `bi_goals` (escopo: tenant/curso/concurso/disciplina, meta em %). Padrão 70% vindo de `config`. | 2 |
| Conteúdos prioritários por concurso | Índice de Preparação sem base | `bi_priority_topics` (concurso/curso × `subject_topic`, peso). Fallback: todos os assuntos das disciplinas do curso. | 2 |
| Curso → concurso | Não sei qual concurso o curso prepara | Coluna nullable `courses.target_exam_type_id`. | 2 |
| Área/competência/habilidade ENEM | Sem análise por competência | Usar `subject` como área enquanto não houver taxonomia; habilidade via `question_tags` se o tenant cadastrar. | 3 |
| Intervenções pedagógicas | Fluxo de acompanhamento inexistente | `pedagogical_interventions` + `pedagogical_intervention_students`. | 3 |
| Resultados de aprovação | Relatório 2027 sem aprovação comprovada | `student_exam_outcomes` (concurso, ano, resultado, evidência, consentimento). | 4 |
| Auditoria de exportações | Exigência LGPD | `bi_export_logs`. | 4 |

---

## 4. Catálogo inicial de métricas

Fonte única: `config/bi_metrics.php` (chave, nome, descrição, fórmula, fontes, amostra mínima, tratamento de ausentes). Exposto em `GET /bi/metrics` e usado nos tooltips do painel e na seção "Metodologia" dos relatórios — **a mesma definição em API, tela e relatório**.

Regras gerais aplicadas a todas:
- Percentuais em 0–100; variação entre percentuais em **p.p.**; variação de contagens em **%**.
- Ausência de dado ⇒ `null` + `sufficient=false`, **nunca zero**. Falta em presencial (`is_absent`) não entra na média.
- Toda métrica devolve `sample` (n de alunos / avaliações / respostas).
- Questões anuladas (`is_annulled`) são excluídas.

| Chave | Nome | Fórmula | Fonte | Amostra mínima |
|-------|------|---------|-------|----------------|
| `students.active` | Alunos ativos | alunos com matrícula ativa no período | enrollments | — |
| `students.recent_activity` | Atividade acadêmica recente | alunos ativos com ≥1 evento (prática, simulado, presença) nos últimos 14 dias ÷ ativos | practice_answers, exam_attempts, attendances | 10 alunos |
| `exams.participation` | Participação em simulados online | tentativas concluídas ÷ (alunos elegíveis × simulados publicados no período) | exams, exam_course, enrollments, exam_attempts | 1 simulado |
| `assessments.avg_pct` | Média dos simulados | média de `nota/nota_máx × 100` por aluno-avaliação | exam_attempts + official_assessment_grades | 5 resultados |
| `assessments.evolution_pp` | Evolução do aproveitamento | média do último terço − média do primeiro terço das avaliações **comparáveis** do aluno (p.p.); média entre alunos | idem | 2 avaliações comparáveis/aluno |
| `practice.first_accuracy` | Acerto no banco de questões | acertos na 1ª tentativa ÷ 1ªs tentativas | practice_answers (counted) | 5 respostas |
| `attendance.rate` | Frequência média | (present + late) ÷ (present + late + absent); `excused` fora do denominador | student_attendances | 4 chamadas |
| `students.improving` / `students.declining` | Alunos com evolução / queda | alunos com `evolution_pp` ≥ +5 / ≤ −5 (limite configurável) | assessments | 2 comparáveis |
| `students.needs_support` | Alunos que precisam de reforço | regra de atenção (§13 do prompt) com motivo explícito | combinação | por regra |
| `subjects.difficulty_rank` | Disciplinas com maior dificuldade | ordenação por aproveitamento (Wilson inferior para empates de amostra) | assessments + practice | 20 respostas |
| `topics.mastery` | Domínio por assunto | níveis de `LearningDiagnosisService::level()` | practice + exam_answers | 5 respostas |
| `engagement.active_weeks` | Regularidade semanal | semanas com atividade ÷ semanas do período | practice, activity_days | 4 semanas |

**Avaliações comparáveis:** mesmo `exam_type_id` **e** mesma modalidade (online × `presencial_*`). Online e presencial nunca são somados na mesma série de evolução; são exibidos lado a lado. Simulado online com várias tentativas: conta a **primeira concluída** (alinhado à regra de primeira tentativa do banco).

---

## 5. Proposta de arquitetura do BI

### Backend (`apiEscola`)

```text
app/Services/Bi/
├── BiFilters.php                 # value object validado (período, ano, curso, turma, disciplina, professor, concurso, modalidade)
├── BiAccessScope.php             # restringe turmas/alunos conforme papel (professor → suas turmas)
├── BiFeatureGate.php             # plano/feature por tenant (tenant_settings module=bi)
├── BiCache.php                   # chave tenant:versão:hash(filtros); versão incrementada por eventos
├── MetricCatalog.php             # lê config/bi_metrics.php, monta {value, previous, delta, trend, sample, sufficient}
├── Sources/
│   ├── AssessmentResultsQuery.php   # UNION online (1ª tentativa concluída) + presencial (nota/máx)
│   ├── PracticeAnswersQuery.php     # reusa scopeCounted + primeira tentativa
│   ├── AttendanceQuery.php
│   └── EnrollmentScopeQuery.php     # aluno ↔ turma vigente na data
├── OverviewService.php
├── AssessmentAnalyticsService.php
├── SubjectTopicAnalyticsService.php
├── ClassAnalyticsService.php
└── StudentEvolutionService.php
app/Http/Controllers/Api/Bi/*Controller.php   # enxutos, só filtros → service → success()
app/Http/Requests/Bi/BiFilterRequest.php
```

- Cálculo **sempre no MySQL** (agregações, `ROW_NUMBER`), nunca carregando respostas na memória PHP.
- `LearningDiagnosisService` e `PracticePerformanceService` passam a aceitar escopo coletivo onde fizer sentido, em vez de duplicar fórmulas.
- Invalidação: observers em `ExamAttempt` (concluída), `OfficialAssessmentGrade`, `StudentAttendance` incrementam `bi:version:{tenant}`; prática (alto volume) usa só TTL de 10 min. Resposta informa `generated_at`.
- Sem tabelas agregadas na Fase 1. Snapshots (`bi_student_period_snapshots`) avaliados na Fase 2 só se o histórico das 3 dimensões ficar lento.

### Envelope das respostas (padrão `type/message/body`)

```json
{
  "type": "success",
  "message": "Indicadores carregados.",
  "body": {
    "meta": { "period": {"from": "2026-08-01", "to": "2026-10-31"}, "previous_period": {...},
              "filters": {...}, "generated_at": "2026-10-31T10:00:00-03:00", "scope": "tenant|teacher" },
    "metrics": [
      { "key": "practice.first_accuracy", "value": 63.4, "previous": 58.1, "delta": 5.3,
        "delta_unit": "pp", "trend": "up", "sample": { "answers": 4120, "students": 87 }, "sufficient": true }
    ],
    "series": { ... }
  }
}
```

---

## 6. Estrutura de componentes (painelEscola)

```text
screens/inteligencia/
├── index.ts
├── BiOverviewScreen.tsx            # Visão Geral
├── BiAssessmentsScreen.tsx         # Análise de Simulados
├── BiSubjectsScreen.tsx            # Disciplinas e Assuntos
├── BiClassesScreen.tsx             # Análise de Turmas (+ detalhe)
├── BiStudentEvolutionScreen.tsx    # Evolução dos Alunos (lista + detalhe)
└── BiPerformanceScreen.tsx         # Desempenho Acadêmico
components/bi/
├── BiFilterBar.tsx         # até 3 filtros visíveis + "Mais filtros" (Modal)
├── MetricTile.tsx          # estende StatTile: delta (p.p./%), seta + palavra, amostra, ícone de info
├── MetricInfoModal.tsx     # descrição/fórmula vinda de /bi/metrics
├── SampleNote.tsx / InsufficientData.tsx
└── charts/ LineChart, BarChart, Histogram, Heatmap, (Fase 2) RadarChart, ScatterPlot
services/biService.ts
hooks/useBiFilters.ts       # estado dos filtros sincronizado com o hash da URL
```

- Gráficos em `react-native-svg` (já instalado), sem nova biblioteca; tokens do design system (`color` de `constants/theme`), série única em `brand`, tooltip no hover e texto alternativo.
- O design system limita dashboards a **3 filtros e 4 StatTiles**. Os 9 filtros e 12 indicadores pedidos ficam assim: 3 filtros principais (Período, Turma, Disciplina) + "Mais filtros"; 4 KPIs de destaque + tabela "Todos os indicadores".
- Menu "Inteligência Educacional" na `Sidebar` mostra **apenas telas implementadas e habilitadas** (sem itens "em breve"). Fase 1 libera 6 dos 13 submenus.

Mobile: nada na Fase 1 (o aluno já tem `desempenho`). Versão resumida do 360° para o aluno a partir da Fase 2, se habilitada.

---

## 7. Endpoints Laravel (Fase 1, todos `GET`, `auth:sanctum` + `IdentifyTenant`)

| Rota | Retorno |
|------|---------|
| `/bi/meta` | features habilitadas, escopo do usuário, opções de filtro (turmas/cursos/disciplinas/concursos permitidos) |
| `/bi/metrics` | catálogo de métricas |
| `/bi/overview` | KPIs + séries do dashboard executivo |
| `/bi/assessments` | evolução e lista de simulados (online e presenciais separados), participação |
| `/bi/assessments/{source}/{id}` | distribuição de notas, desempenho por disciplina/assunto (`source` = `online`\|`presencial`) |
| `/bi/subjects` | aproveitamento por disciplina (avaliações + banco) |
| `/bi/subjects/{subject}/topics` | ranking de assuntos, evolução, questões associadas |
| `/bi/classes` | comparação entre turmas (média, evolução, frequência, n) |
| `/bi/classes/{schoolClass}` | painel da turma, alunos em atenção |
| `/bi/students` | lista paginada com evolução e alertas |
| `/bi/students/{student}/evolution` | série temporal, por disciplina, aluno × turma |

Impacto: **somente rotas novas**; nenhum endpoint existente muda de contrato. Atualizar `API_VERSION` em `api_meta.php`.

---

## 8. Consultas e otimização MySQL

- Índices novos (migration reversível), a confirmar com `EXPLAIN` em dados reais:
  - `exam_attempts (tenant_id, status, finished_at)` e `(tenant_id, student_id, exam_id)` — hoje só há índices de FK.
  - `official_assessment_grades (tenant_id, official_assessment_id)`.
  - `student_attendances` e `practice_answers (tenant_id, answered_at)` já atendem.
- Período sempre como intervalo sobre coluna indexada (sem `DATE(coluna)` no `WHERE`); fuso `America/Sao_Paulo` convertido para UTC antes da consulta (padrão já usado no ranking).
- Primeira tentativa via `ROW_NUMBER` em subconsulta restrita ao período/escopo.
- Cache por tenant + filtros (TTL 10 min) e versão invalidada por eventos; paginação em listas de alunos.
- Relatórios pesados (Fase 4) via job na fila `database`, com arquivo para download.

---

## 9. Modelo de permissões

| Papel | Escopo no BI |
|-------|--------------|
| `super_admin` | Qualquer tenant (via `tenant_id` validado como hoje). |
| `admin` | Tenant inteiro (visão institucional + pedagógica). |
| Coordenação | **Não existe papel.** Ver decisão pendente 2. |
| `professor` | Somente turmas em que está em `class_schedule_user` (e disciplinas de `subject_user` quando houver filtro por disciplina). Aplicado no backend por `BiAccessScope`, inclusive em `/bi/meta`. |
| `secretaria` | Sem acesso ao BI pedagógico (proposta). |
| `aluno` | Fase 2+: apenas os próprios indicadores, pelos endpoints `aluno/*`. |

Feature gate (`tenant_settings`, `module = bi`): `enabled`, `plan` (`basic`\|`advanced`), `ai_enabled`. Rotas do BI Avançado retornam `403` com `code: bi_feature_disabled` quando não habilitadas; o painel esconde o item com base em `/bi/meta`.

---

## 10. Protótipos das telas principais (Fase 1)

**Visão Geral**
```text
Inteligência Educacional › Visão geral                         Atualizado 10:02
[Período: últimos 90 dias ▾] [Turma: todas ▾] [Disciplina: todas ▾] [Mais filtros]
┌ Média simulados ┐┌ Acerto no banco ┐┌ Frequência média ┐┌ Precisam reforço ┐
│ 64,2%  ▲ 3,1 pp ││ 61,0%  ▼ 1,2 pp ││ 87%    ▲ 2 pp    ││ 14 alunos  ▲ 3   │
│ n = 312 result. ││ n = 8.420 resp. ││ n = 1.180 cham.  ││ ver lista →      │
└─────────────────┘└─────────────────┘└──────────────────┘└──────────────────┘
┌ Evolução mensal (online × presencial, séries separadas) ───────────────────┐
└────────────────────────────────────────────────────────────────────────────┘
┌ Disciplinas com maior dificuldade ─────┐┌ Todos os indicadores (tabela) ────┐
└────────────────────────────────────────┘└───────────────────────────────────┘
```

**Turma**
```text
Turmas › CPM A           [Período ▾] [Disciplina ▾]
KPIs: média · evolução (pp) · frequência · participação
[Assuntos críticos: heatmap assunto × avaliação]   [Distribuição de notas: histograma]
Alunos em atenção: nome · motivo · indicador · desde
```

**Evolução do aluno**
```text
Alunos › Maria S. · CPM A · objetivo CPM
[Linha: aproveitamento por avaliação comparável, aluno × média da turma]
[Barras: por disciplina]  [Lista: assuntos críticos e em evolução]  amostras sempre visíveis
```

---

## 11. Plano de desenvolvimento incremental

**Fase 1** (fundação), em passos pequenos e entregáveis:
1. `config/bi_metrics.php`, `BiFilters`, `BiAccessScope`, `BiFeatureGate`, `/bi/meta`, `/bi/metrics` + testes de escopo.
2. Migration de índices + `student_activity_days` (início da coleta histórica).
3. `AssessmentResultsQuery` + `/bi/assessments` + tela Análise de Simulados.
4. `/bi/overview` + tela Visão Geral.
5. `/bi/subjects`, `/bi/subjects/{id}/topics` + tela Disciplinas e Assuntos.
6. `/bi/classes` + tela Análise de Turmas.
7. `/bi/students`, `/bi/students/{id}/evolution` + tela Evolução dos Alunos; Desempenho Acadêmico.

**Fases 2–5** conforme o prompt (360°, inteligência pedagógica e intervenções, relatórios/2027, IA e planos), cada uma precedida de proposta curta das tabelas novas listadas em §3.2.

Fórmulas propostas para a Fase 2 (documentadas e configuráveis; pesos renormalizados quando um componente não tem dado; sem índice se menos de 2 componentes forem suficientes):
- **Aprendizagem** = 60% média de avaliações comparáveis + 40% acerto de 1ª tentativa no banco.
- **Engajamento** = 40% frequência + 30% regularidade semanal + 30% participação em simulados.
- **Preparação** = 50% domínio nos assuntos prioritários + 30% cobertura dos prioritários + 20% tendência nos simulados do concurso.
- Matriz de perfis: Aprendizagem × Engajamento contra limites configuráveis (padrão 70 / 60), recalculada por período, com data e sem rótulo permanente.

---

## 12. Critérios de aceite e testes da Fase 1

- **Isolamento:** teste de feature garantindo que nenhum endpoint `/bi/*` retorna dados de outro tenant; professor só vê suas turmas (inclusive nas opções de filtro).
- **Consistência:** o valor de um KPI em `/bi/overview` é idêntico ao total recalculado em `/bi/assessments` / `/bi/subjects` com os mesmos filtros.
- **Dados ausentes:** aluno sem avaliação retorna `null` + `sufficient=false`, nunca 0; falta presencial não reduz média.
- **Unidades:** variação de percentuais retorna `delta_unit = "pp"`.
- **Comparabilidade:** série de evolução não mistura online e presencial nem concursos diferentes.
- **Coerência com o app:** acerto do banco por aluno no BI = valor de `aluno/learning/overview`.
- **Performance:** `/bi/overview` < 1,5 s sem cache no maior tenant (medido com `EXPLAIN` e log de tempo).
- **UI:** estados de carregamento, vazio e "dados insuficientes"; temas claro/escuro; sem overflow horizontal em 375 px, tablet e desktop.
- Testes rodando com `phpunit.mysql.xml` (window functions não funcionam no SQLite).

---

## 13. Decisões validadas (31/10/2026)

1. **Simulados presenciais:** a fonte é *Avaliações presenciais* (`official_assessments` + `official_assessment_grades`).
2. **Coordenação:** criado o papel `coordenador`; `admin` também tem a visão de coordenação. Ambos com escopo do tenant inteiro no BI.
3. **Escopo do professor:** no BI, restrito às turmas que leciona (`class_schedule_user` ou `teacher_id` legado, horários não excluídos).
4. **Metas padrão:** 70% de aproveitamento e ±5 p.p. para evolução/queda (`config/bi.php`).

## 14. Andamento

- **Fase 1 · passo 1 (fundação) — concluído:** papel `coordenador`, `config/bi.php`, `config/bi_metrics.php`, `Services/Bi` (`BiFeatureGate`, `BiAccessScope`, `BiFilters`, `MetricCatalog`, `BiMetaService`), `GET /bi/meta`, `GET /bi/metrics`. Testes: `tests/Feature/BiMetaTest.php`, `tests/Unit/BiMetricCatalogTest.php`.
- **Coordenação = admin (31/10/2026):** `coordenador` incluído em todas as checagens de papel da API (16 arquivos), do painel e do mobile. Teste: `tests/Feature/CoordenadorRoleTest.php`.
- **Fase 1 · Visão geral (tela 01) — concluído:** `GET /bi/overview` (`OverviewService` + fontes em `Services/Bi/Sources`: `StudentUniverse`, `AssessmentResults`, `PracticeFirstAttempts`, `AttendanceRecords`), cache de 10 min por tenant/escopo/filtros. Painel: `screens/inteligencia/BiOverviewScreen.tsx`, `components/bi/*`, tokens `data-*`/`seq-*`. Teste: `tests/Feature/BiOverviewTest.php`.
- Fora desta entrega (fases seguintes): sparklines dos indicadores, exportação PDF/Excel, matriz de perfis e resumo com IA da tela 01.
- **Fase 1 · Disciplinas e assuntos (tela 04) — concluído (02/11/2026):** fonte única `Sources/AnswerStream` (respostas de simulados online na 1ª tentativa concluída + banco na 1ª tentativa, com a alternativa marcada; a Visão geral passou a usá-la), `SubjectAnalyticsService` e `BiSubjectController`:
  - `GET /bi/subjects` — disciplinas com respostas no recorte (abas);
  - `GET /bi/subjects/{subject}` — 4 indicadores (`subject.*`), mapa de calor turma × assunto (plano advanced; célula < 20 respostas = null) e ranking de assuntos com variação em p.p.;
  - `GET /bi/subjects/{subject}/topics/{topic}/errors` — questões com maior taxa de erro e distribuição por alternativa (`limit` 1–20).
  - Parâmetro `source` = `both|online|practice`. Professor só acessa disciplinas que leciona (`BiAccessScope::subjectIds()`). Aluno em duas turmas conta nas duas no mapa de calor.
  - Painel: `screens/inteligencia/BiSubjectsScreen.tsx`, `components/bi/Heatmap.tsx`, `components/bi/RecurringErrors.tsx`; rota `#/inteligencia/disciplinas[/id]`; as barras de dificuldade da Visão geral abrem a disciplina. Teste: `tests/Feature/BiSubjectTest.php`.
  - Fora desta entrega: "Relatório da disciplina" e "Gerar lista de revisão" (fase de relatórios/exportação), ordem dos assuntos por peso no edital (não há esse dado; hoje é por volume de respostas) e o texto interpretativo do padrão de erro (hoje é um resumo factual do distrator principal; a versão com IA fica para a fase de IA).
- **Fase 1 · índices + coleta de atividade — concluído (02/11/2026):**
  - `2026_11_02_000001_add_bi_indexes`: `exam_attempts (tenant_id, student_id, exam_id)`, `exam_attempts (tenant_id, attempt_status_id, finished_at)` e `practice_answers (tenant_id, student_id, exam_question_id, answered_at)`. `official_assessment_grades` já tinha índice por avaliação. O `down()` recria o índice simples da FK quando o MySQL o descartou. Confirmar com `EXPLAIN` em dados reais.
  - `2026_11_02_000002_create_student_activity_days_table` + middleware `RecordStudentActivity` no grupo autenticado: só papel `aluno`, uma linha por aluno/dia (fuso de São Paulo), `touches` = blocos de 15 min com uso, escrita após a resposta e limitada por cache. Desligável com `BI_ACTIVITY_TRACKING=false`. Teste: `tests/Feature/StudentActivityTrackingTest.php`.
  - A coleta começa a valer histórico só a partir do deploy; ainda não alimenta nenhum indicador (base para `engagement.active_weeks` na tela de Frequência e engajamento).
- **Fase 1 · Análise de simulados — concluído (02/11/2026):** `AssessmentAnalyticsService` + `BiAssessmentController`:
  - `GET /bi/assessments` — indicadores (`assessments.count`, `exams.participation`, `assessments.avg_online`, `assessments.avg_presencial`, `assessments.below_goal_share`), evolução mensal por modalidade e lista de avaliações (mais recente primeiro, até 100) com participantes, faltas (presencial), média, mediana e quantos abaixo da meta;
  - `GET /bi/assessments/{online|presencial}/{id}` — resumo (média, mediana, mín./máx., % na meta), histograma em faixas de 10 p.p., comparação entre turmas, desempenho por disciplina (online: pontos obtidos ÷ possíveis; presencial: nota ÷ máxima), assuntos com menor acerto (online) e alunos do menor para o maior resultado (até 100).
  - Média/mediana só com ≥ 5 participantes. Presencial de turma fora do escopo do professor → 403; online mostra só os alunos do escopo.
  - A série mensal passou para `AssessmentResults::monthly()` (usada também pela Visão geral).
  - Painel: `BiAssessmentsScreen`, `BiAssessmentDetailScreen`, `components/bi/ScoreHistogram`, `PctBars`, `SegmentedControl`; rotas `#/inteligencia/simulados` e `#/inteligencia/simulados/{modalidade}/{id}`. Teste: `tests/Feature/BiAssessmentTest.php`.
  - Fora desta entrega: questões com mais erro dentro do simulado (já existe `ExamQuestionErrorsReportService`; integrar depois) e comparação entre simulados do mesmo concurso.
- **Fase 1 · Análise de turmas — concluído (02/11/2026):** `ClassAnalyticsService` + `BiClassController`:
  - `GET /bi/classes` — comparação entre as turmas do recorte: alunos, média online, média presencial, acerto no banco, frequência (chamadas da própria turma), participação online e alunos em atenção; cada célula é um indicador do catálogo (amostra mínima + variação vs. período anterior);
  - `GET /bi/classes/{id}` — dados da turma (curso, ano, professores) e alunos com médias individuais por modalidade, banco, frequência, evolução (p.p.) e motivos de atenção, em atenção primeiro.
  - Os cards, a evolução mensal e as disciplinas do detalhe vêm de `/bi/overview?school_class_id=…`, então a turma usa exatamente o cálculo da Visão geral.
  - Regras de atenção e evolução por aluno extraídas para `StudentSignals` (Visão geral e turmas usam a mesma classe).
  - Painel: `BiClassesScreen`, `BiClassDetailScreen`, `components/bi/MetricCell`, `components/bi/overviewTiles`; rotas `#/inteligencia/turmas[/id]`. Teste: `tests/Feature/BiClassTest.php`.
  - Fora desta entrega: mapa de calor assunto × avaliação da turma (o mapa turma × assunto já está em Disciplinas e assuntos) e a coluna "desde" dos alunos em atenção (exige histórico de alertas, Fase 3).
- **Fase 1 · Evolução dos alunos — concluído (02/11/2026):** `StudentEvolutionService` + `BiStudentController`:
  - `GET /bi/students` — resumo (no recorte, em atenção, em evolução, em queda) e lista paginada (`filter=all|attention|improving|declining`, `search`, `page`, `per_page` 5–100) com médias por modalidade, banco, frequência, evolução e motivos;
  - `GET /bi/students/{id}/evolution` — séries por modalidade + concurso (só avaliações comparáveis) com a média dos colegas das mesmas turmas em cada avaliação, acerto por disciplina × colegas, assuntos críticos e em evolução (vs. período anterior). Aluno fora do recorte → 403.
  - Linhas de aluno extraídas para `StudentRoster` (usado também no detalhe da turma).
- **Fase 1 · Desempenho acadêmico — concluído (02/11/2026):** definido como a visão de boletim (o doc não especificava): `AcademicPerformanceService` + `GET /bi/performance` com `grades.avg`, `grades.at_goal_share`, `grades.absence_rate`, matriz turma × disciplina (mesmo formato do mapa de calor) e tabela por disciplina com variação, % na meta e faltas. Só avaliações presenciais publicadas; falta fora da média.
  - Painel: `BiStudentsScreen`, `BiStudentEvolutionScreen`, `BiPerformanceScreen`, `components/bi/StudentRosterTable`; `LineChart` ganhou série de comparação com legenda; `Heatmap` com rótulos configuráveis. Rotas `#/inteligencia/alunos[/id]` e `#/inteligencia/desempenho`. Testes: `tests/Feature/BiStudentTest.php`, `tests/Feature/BiPerformanceTest.php`.
- **Telas da Fase 1 entregues.** Pendências de aceite (§12): medir `/bi/overview` sem cache no maior tenant (`EXPLAIN` + tempo), conferir o acerto do banco por aluno contra `aluno/learning/overview`, e revisão visual em 375 px / tablet / desktop nos temas claro e escuro com dados reais.
- Próximo: validação de aceite da Fase 1; depois Fase 2 (Diagnóstico 360° e Perfis — telas 02 e 03), precedida de proposta curta das tabelas novas.
