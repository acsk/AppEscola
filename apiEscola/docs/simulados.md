# Módulo de Simulados

Permite criar simulados com questões objetivas e/ou discursivas, classificados por matéria e curso (ex.: Matemática → ENEM). Alunos realizam tentativas e recebem pontuação automática; endpoints de estatísticas e ranking fornecem os dados para gráficos.

---

## Changelog

| Data | O que mudou |
|---|---|
| 2026-05-10 | Endpoint `GET /api/aluno/exams` passou a retornar `nota`, `score_display` e `aproveitamento` da tentativa mais recente (quando visível) |
| 2026-05-04 | Status `pending_review`: resultado bloqueado até correção manual de questões discursivas/`allow_text_answer` |
| 2026-05-04 | Status `awaiting_release` + flag `release_results_after_end` para segurar o resultado até o fim do período |
| 2026-05-04 | Novo endpoint `PATCH /api/exam-attempts/{attempt}/answers/{answer}/correct` |
| 2026-05-04 | Campos de retentativa: `allow_retake`, `max_attempts`, `min_score_to_retake` |
| 2026-05-04 | `subject` nas respostas agora inclui `icon` e `color` |
| 2026-05-03 | Campos `starts_at` e `ends_at` no simulado |
| 2026-05-03 | Campo `triggers_text_input` nas opções de questão objetiva |
| 2026-05-03 | Campo `allow_text_answer` nas questões objetivas |

---

## Tabelas

| Tabela | Descrição |
|---|---|
| `exam_statuses` | Domínio: estados possíveis de um simulado |
| `exam_types` | Domínio: tipos de simulado (ENEM, vestibular, etc.) |
| `exam_attempt_statuses` | Domínio: estados possíveis de uma tentativa |
| `exams` | Cabeçalho do simulado (título, tipo, status, duração, nota mínima) |
| `exam_questions` | Questões vinculadas ao simulado (objetiva ou discursiva, com pontuação) |
| `exam_question_options` | Opções de resposta de questões objetivas (uma marcada como correta) |
| `exam_attempts` | Registro de cada vez que um aluno realiza o simulado |
| `exam_answers` | Respostas salvas pelo aluno para cada questão de uma tentativa |

---

## Tabelas de domínio

### `exam_statuses`

| id | slug | label | order |
|---|---|---|---|
| 1 | `draft` | Rascunho | 1 |
| 2 | `published` | Publicado | 2 |
| 3 | `archived` | Arquivado | 3 |

### `exam_types`

| id | slug | label |
|---|---|---|
| 1 | `custom` | Personalizado |
| 2 | `enem` | ENEM |
| 3 | `vestibular` | Vestibular |
| 4 | `fuvest` | FUVEST |
| 5 | `concurso` | Concurso |

> Novos tipos podem ser inseridos diretamente na tabela `exam_types` sem alteração de código.

### `exam_attempt_statuses`

| id | slug | label | order |
|---|---|---|---|
| 1 | `in_progress` | Em andamento | 1 |
| 2 | `pending_review` | Aguardando correção | 2 |
| 3 | `awaiting_release` | Aguardando liberação | 3 |
| 4 | `completed` | Concluído | 4 |
| 5 | `abandoned` | Abandonado | 5 |

---

## Ciclo de vida de um simulado

```
draft  ──→  published  ──→  archived
```

Somente simulados com `status = published` podem ser iniciados por alunos.

---

## Endpoints

Todos os endpoints exigem autenticação via Bearer token (`Authorization: Bearer {token}`).

### Domínios (lookup)

#### `GET /api/exam-statuses`
Lista todos os status disponíveis.

**Resposta `200`:**
```json
[
  { "id": 1, "slug": "draft",     "label": "Rascunho"  },
  { "id": 2, "slug": "published", "label": "Publicado" },
  { "id": 3, "slug": "archived",  "label": "Arquivado" }
]
```

#### `GET /api/exam-types`
Lista todos os tipos disponíveis.

**Resposta `200`:**
```json
[
  { "id": 1, "slug": "custom",     "label": "Personalizado" },
  { "id": 2, "slug": "enem",       "label": "ENEM"          },
  { "id": 3, "slug": "vestibular", "label": "Vestibular"    },
  { "id": 4, "slug": "fuvest",     "label": "FUVEST"        },
  { "id": 5, "slug": "concurso",   "label": "Concurso"      }
]
```

---

### Simulados

#### `GET /api/exams`
Lista os simulados do tenant com paginação (20 por página).

**Query params:**

| Param | Tipo | Descrição |
|---|---|---|
| `status` | string | slug: `draft`, `published`, `archived` |
| `exam_type` | string | slug: `custom`, `enem`, `vestibular`, `fuvest`, `concurso` |
| `course_id` | integer | Filtra por curso |
| `subject_id` | integer | Filtra por matéria |
| `search` | string | Busca parcial no título |

**Resposta `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "title": "Simulado ENEM – Matemática",
      "exam_type_id": 2,
      "exam_type": "enem",
      "exam_type_label": "ENEM",
      "exam_status_id": 2,
      "status": "published",
      "status_label": "Publicado",
      "duration_minutes": 90,
      "passing_score": 60,
      "starts_at": "2026-06-01T08:00:00.000Z",
      "ends_at": "2026-06-30T23:59:59.000Z",
      "release_results_after_end": true,
      "allow_retake": true,
      "max_attempts": 3,
      "min_score_to_retake": 70.0,
      "total_questions": 10,
      "total_points": 10.0,
      "course": { "id": 2, "name": "ENEM" },
      "subject": { "id": 5, "name": "Matemática", "icon": "calculator", "color": "#3B82F6" }
    }
  ],
  "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 1 }
}
```

---

#### `POST /api/exams`
Cria um novo simulado.

**Body:**
```json
{
  "title": "Simulado ENEM – Matemática",
  "exam_type": "enem",
  "status": "draft",
  "course_id": 2,
  "subject_id": 5,
  "description": "Simulado com 10 questões de matemática nível ENEM.",
  "duration_minutes": 90,
  "passing_score": 60,
  "starts_at": "2026-06-01T08:00:00",
  "ends_at": "2026-06-30T23:59:59",
  "release_results_after_end": true,
  "allow_retake": true,
  "max_attempts": 3,
  "min_score_to_retake": 70
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `title` | string | ✅ | |
| `exam_type` | slug | ❌ (default: `custom`) | Ver tabela `exam_types` |
| `status` | slug | ❌ (default: `draft`) | Ver tabela `exam_statuses` |
| `course_id` | integer | ❌ | |
| `subject_id` | integer | ❌ | |
| `description` | string | ❌ | |
| `duration_minutes` | integer | ❌ | |
| `passing_score` | numeric (0-100) | ❌ | Nota mínima para aprovação |
| `starts_at` | datetime | ❌ | Início do período de realização |
| `ends_at` | datetime | ❌ | Fim do período de realização (deve ser após `starts_at`) |
| `release_results_after_end` | boolean | ❌ (default: `false`) | Quando `true`, a nota/correção só é liberada após `ends_at` |
| `allow_retake` | boolean | ❌ (default: `false`) | Permite refazer após entregar |
| `max_attempts` | integer (1-255) | ❌ | Máximo de tentativas (null = ilimitado) |
| `min_score_to_retake` | numeric (0-100) | ❌ | Aluno pode refazer enquanto não atingiu esta nota. Uma vez aprovado, fica bloqueado permanentemente. `null` = usa `passing_score` |

> A validação usa `exists:exam_types,slug` e `exists:exam_statuses,slug` — valores inválidos retornam erro 422.

**Resposta `201`:** objeto do simulado criado.

---

#### `GET /api/exams/{exam}`
Retorna o simulado com questões e opções carregadas.

**Resposta `200`:** simulado + `questions[].options[]`

---

#### `PUT /api/exams/{exam}`
Atualiza qualquer campo do simulado. Todos os campos são opcionais.

---

#### `DELETE /api/exams/{exam}`
Soft-delete do simulado (e cascade nas questões).

**Resposta `200`:**
```json
{ "message": "Simulado removido com sucesso." }
```

---

#### `GET /api/exams/{exam}/stats`
Retorna estatísticas agregadas para gráficos.

**Resposta `200`:**
```json
{
  "exam_id": 1,
  "total_attempts": 30,
  "avg_percentage": 68.5,
  "pass_count": 18,
  "pass_rate": 60.0,
  "by_question": [
    {
      "question_id": 1,
      "question_text": "Qual o resultado de 2 + 2?…",
      "subject": "Matemática",
      "correct_count": 28,
      "total_answers": 30,
      "hit_rate": 93.3
    }
  ],
  "by_subject": [
    { "subject": "Matemática", "avg_hit_rate": 72.4, "questions": 10 }
  ]
}
```

---

#### `GET /api/exams/{exam}/ranking`
Ranking dos alunos por percentual de acerto.

**Resposta `200`:**
```json
{
  "exam_id": 1,
  "ranking": [
    {
      "position": 1,
      "student_id": 4,
      "student_name": "Ana Lima",
      "enrollment_number": "MAT-1-00003",
      "score": 9.5,
      "max_score": 10.0,
      "percentage": 95.0,
      "finished_at": "2026-05-03T14:22:00.000Z"
    }
  ]
}
```

---

### Questões

#### `GET /api/exams/{exam}/questions`
Lista todas as questões do simulado com suas opções.

> `is_correct` é exposto apenas nas rotas administrativas do simulado (`GET /api/exams/{exam}`). Não é exposto nas rotas de tentativa, protegendo o gabarito durante a realização.

**Resposta `200`:**
```json
[
  {
    "id": 1,
    "exam_id": 1,
    "subject_id": 5,
    "subject": { "id": 5, "name": "Matemática" },
    "type": "multiple_choice",
    "question_text": "Qual é a raiz quadrada de 144?",
    "image_url": null,
    "video_url": null,
    "points": 1.0,
    "order": 1,
    "explanation": "√144 = 12",
    "options": [
      { "id": 1, "option_text": "10", "order": 1, "is_correct": false },
      { "id": 2, "option_text": "12", "order": 2, "is_correct": true  },
      { "id": 3, "option_text": "14", "order": 3, "is_correct": false },
      { "id": 4, "option_text": "16", "order": 4, "is_correct": false }
    ],
    "created_at": "2026-05-03T14:00:00.000Z",
    "updated_at": "2026-05-03T14:00:00.000Z"
  }
]
```

---

#### `POST /api/exams/{exam}/questions/upload-image`
Faz upload da imagem do enunciado para o servidor da API (storage local/public).

**Request:** `multipart/form-data`

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `question_id` | integer | ❌ | Informe quando a questão já existir, para salvar a imagem em uma pasta específica da questão |
| `image` | file | ✅ | `jpg`, `jpeg`, `png`, `webp`, `gif`, máximo 5MB |

**Resposta `201`:**
```json
{
  "message": "Imagem enviada com sucesso.",
  "image_url": "http://localhost:4000/storage/exam-questions/1/3/12/arquivo.png",
  "path": "exam-questions/1/3/12/arquivo.png"
}
```

Quando `question_id` ainda não existir, o arquivo é salvo em `exam-questions/{tenant}/{exam}/draft/...`.

Use a `image_url` retornada para preencher o campo `image_url` no cadastro/edição da questão.

> Observação de infraestrutura: execute `php artisan storage:link` para disponibilizar os arquivos via `/storage/...`.

#### `POST /api/exams/{exam}/questions`
Adiciona uma questão ao simulado.

**Regra do enunciado:** a questão deve ter pelo menos um entre `question_text` e `image_url`. Pode enviar só texto, só imagem ou ambos.

**Body – questão objetiva pura:**
```json
{
  "type": "multiple_choice",
  "question_text": "Qual é a raiz quadrada de 144?",
  "subject_id": 5,
  "points": 1.0,
  "order": 1,
  "explanation": "√144 = 12",
  "options": [
    { "option_text": "10", "is_correct": false, "order": 1 },
    { "option_text": "12", "is_correct": true,  "order": 2 },
    { "option_text": "14", "is_correct": false, "order": 3 },
    { "option_text": "16", "is_correct": false, "order": 4 }
  ]
}
```

**Body – questão com imagem (sem texto):**
```json
{
  "type": "multiple_choice",
  "image_url": "https://cdn.exemplo.com/img/q-geo-01.png",
  "subject_id": 5,
  "points": 1.0,
  "options": [
    { "option_text": "Alternativa A", "is_correct": false, "order": 1 },
    { "option_text": "Alternativa B", "is_correct": true,  "order": 2 }
  ]
}
```

**Body – questão objetiva + "Outro" (híbrida):**  
Adicione uma opção com `triggers_text_input: true`. Quando o candidato selecioná-la, o frontend exibe um campo de texto. O texto é enviado como `text_answer` junto com o `option_id`.
```json
{
  "type": "multiple_choice",
  "question_text": "Como você ficou sabendo do nosso vestibular?",
  "subject_id": 5,
  "points": 1.0,
  "options": [
    { "option_text": "Internet",  "is_correct": false, "triggers_text_input": false, "order": 1 },
    { "option_text": "Amigos",    "is_correct": false, "triggers_text_input": false, "order": 2 },
    { "option_text": "Escola",    "is_correct": false, "triggers_text_input": false, "order": 3 },
    { "option_text": "Outro",     "is_correct": false, "triggers_text_input": true,  "order": 4 }
  ]
}
```

**Body – questão discursiva:**
```json
{
  "type": "essay",
  "question_text": "Explique o Teorema de Pitágoras.",
  "subject_id": 5,
  "points": 2.0
}
```

| Campo | Tipo | Obrigatório |
|---|---|---|
| `type` | `multiple_choice` \| `essay` | ✅ |
| `question_text` | string | ✅* |
| `subject_id` | integer | ❌ |
| `points` | numeric | ❌ (default: `1.0`) |
| `order` | integer | ❌ (auto-incremento) |
| `image_url` | url | ✅* |
| `video_url` | url | ❌ |
| `explanation` | string | ❌ |
| `options` | array | ✅ se `type = multiple_choice` |
| `options[].option_text` | string | ✅ |
| `options[].is_correct` | boolean | ✅ |
| `options[].triggers_text_input` | boolean | ❌ (default: `false`) — quando selecionada, exibe campo de texto livre |
| `options[].order` | integer | ❌ |
| `allow_text_answer` | boolean | ❌ (default: `false`) — habilita campo textual em questões objetivas |

\* `question_text` e `image_url` seguem regra de composição: é obrigatório informar ao menos um dos dois.

**Erro `422` (exemplo):**
```json
{
  "message": "Dados inválidos.",
  "errors": {
    "question_text": [
      "Informe o texto do enunciado, a imagem, ou ambos."
    ]
  }
}
```

**Resposta `201`:** questão criada com opções.

```json
{
  "id": 2,
  "exam_id": 1,
  "subject_id": 5,
  "subject": { "id": 5, "name": "Matemática" },
  "type": "multiple_choice",
  "question_text": "Qual é a raiz quadrada de 144?",
  "image_url": "https://cdn.exemplo.com/img/q1.png",
  "video_url": null,
  "points": 1.0,
  "order": 1,
  "explanation": "√144 = 12",
  "options": [
    { "id": 5, "option_text": "10", "order": 1, "is_correct": false },
    { "id": 6, "option_text": "12", "order": 2, "is_correct": true  },
    { "id": 7, "option_text": "14", "order": 3, "is_correct": false },
    { "id": 8, "option_text": "16", "order": 4, "is_correct": false }
  ],
  "created_at": "2026-05-03T14:00:00.000Z",
  "updated_at": "2026-05-03T14:00:00.000Z"
}
```

---

#### `GET /api/exams/{exam}/questions/{question}`
Retorna uma questão específica com opções e `is_correct` exposto (rota administrativa).

---

#### `PUT /api/exams/{exam}/questions/{question}`
Atualiza a questão. Se `options` for enviado, as opções anteriores são substituídas integralmente.

Na atualização parcial, também vale a mesma regra: após salvar, a questão deve continuar com `question_text`, `image_url` ou ambos.

---

#### `DELETE /api/exams/{exam}/questions/{question}`
Remove a questão (soft-delete). Opções são excluídas em cascata.

---

### Endpoints do aluno

#### `GET /api/aluno/exams`
Lista os simulados disponíveis para o aluno autenticado, incluindo simulados encerrados.

Critérios aplicados:
- usuário com `role = aluno`
- aluno ativo
- matrícula ativa e vigente
- simulado publicado
- curso do simulado compatível com a matrícula ativa

**Resposta `200` (resumo):**
```json
{
  "type": "success",
  "message": "Simulados disponíveis.",
  "body": [
    {
      "id": 9,
      "title": "Simulado – Português",
      "attempt_status": "completed",
      "nota": 8,
      "score_display": "8/10",
      "aproveitamento": 80,
      "can_start": true
    }
  ]
}
```

Campos adicionais desta listagem:

| Campo | Tipo | Descrição |
|---|---|---|
| `attempt_status` | string | `not_started` \| `in_progress` \| `pending_review` \| `awaiting_release` \| `completed` |
| `nota` | number \| null | Nota da tentativa mais recente por simulado |
| `score_display` | string \| null | Nota formatada como `x/y` |
| `aproveitamento` | number \| null | Percentual da tentativa mais recente |
| `can_start` | boolean | Indica se ainda está dentro da janela para iniciar tentativa |

> Quando o status visível para o aluno for `awaiting_release`, os campos `nota`, `score_display` e `aproveitamento` retornam `null`.

---

### Tentativas

#### `POST /api/exams/{exam}/start`
Inicia uma tentativa para um aluno. O simulado precisa estar `published`.

> As questões **não** são retornadas neste endpoint — busque-as via `GET /api/exams/{exam}/questions`. As opções retornadas por esse endpoint **não expõem `is_correct`**, protegendo o gabarito.

**Body:**
```json
{ "student_id": 4 }
```

**Regra:** se já existir uma tentativa `in_progress` para o mesmo aluno+simulado, retorna erro de validação.

**Resposta `201`:**
```json
{
  "id": 7,
  "exam_id": 1,
  "exam": { "id": 1, "title": "Simulado ENEM – Matemática" },
  "student_id": 4,
  "student": { "id": 4, "name": "João Silva" },
  "status": "in_progress",
  "started_at": "2026-05-03T14:00:00.000Z",
  "finished_at": null,
  "score": null,
  "max_score": 10.0,
  "percentage": null,
  "passed": null,
  "answers": [],
  "created_at": "2026-05-03T14:00:00.000Z",
  "updated_at": "2026-05-03T14:00:00.000Z"
}
```

---

#### `POST /api/exam-attempts/{attempt}/answer`
Salva ou atualiza a resposta de uma questão. Pode ser chamado múltiplas vezes durante a tentativa.

**Body – objetiva (selecionando uma opção):**
```json
{ "question_id": 3, "option_id": 12 }
```

**Body – objetiva com justificativa textual (fallback):**  
Quando o candidato não encontra a resposta entre as opções, pode enviar `text_answer` em vez de (ou junto com) `option_id`. Se nenhuma opção for selecionada, a questão ficará pendente de correção manual.
```json
{ "question_id": 3, "text_answer": "A resposta correta seria 108, pois..." }
```

**Body – objetiva com opção + justificativa:**
```json
{ "question_id": 3, "option_id": 12, "text_answer": "Escolhi esta porque..." }
```

**Body – discursiva:**
```json
{ "question_id": 5, "text_answer": "O teorema de Pitágoras afirma que..." }
```

| Campo | Tipo | Regra |
|---|---|---|
| `question_id` | integer | ✅ obrigatório |
| `option_id` | integer\|null | Obrigatório para objetivas, a menos que `text_answer` seja informado |
| `text_answer` | string\|null | Obrigatório para discursivas; opcional como fallback em objetivas |

**Resposta `200`:**
```json
{ "message": "Resposta salva." }
```

---

#### `POST /api/exam-attempts/{attempt}/finish`
Finaliza a tentativa e calcula a pontuação automática das questões objetivas puras.

**Comportamento por tipo de questão:**

| Tipo | Corrigido em? | `status` resultante |
|---|---|---|
| Objetiva pura (`allow_text_answer = false`) | Automaticamente no `finish` | — |
| Objetiva com `allow_text_answer = true` | Aguarda correção manual | `pending_review` |
| Discursiva (`essay`) | Aguarda correção manual | `pending_review` |

Se **todas** as respostas foram corrigidas automaticamente:
- com `release_results_after_end = false` → `status: "completed"`
- com `release_results_after_end = true` e `ends_at` ainda no futuro → `status: "awaiting_release"`

Se houver **qualquer** resposta pendente de correção → `status: "pending_review"`, `score: null`, `percentage: null`. O resultado **não é liberado** ao aluno até que o admin corrija todas as respostas.

**Resposta `200` — sem pendências (apenas objetivas puras):**

```json
{
  "id": 7,
  "status": "completed",
  "started_at": "2026-05-03T14:00:00.000Z",
  "finished_at": "2026-05-03T14:45:00.000Z",
  "score": 8.5,
  "max_score": 10.0,
  "percentage": 85.0,
  "passed": true,
  "answers": [
    { "question_id": 3, "option_id": 12, "text_answer": null, "is_correct": true,  "points_earned": 1.0 },
    { "question_id": 4, "option_id": 15, "text_answer": null, "is_correct": false, "points_earned": 0.0 }
  ]
}
```

**Resposta `200` — com pendências (discursiva ou `allow_text_answer`):**

```json
{
  "id": 7,
  "status": "pending_review",
  "started_at": "2026-05-03T14:00:00.000Z",
  "finished_at": "2026-05-03T14:45:00.000Z",
  "score": null,
  "max_score": 10.0,
  "percentage": null,
  "pending_answers_count": 2,
  "passed": null,
  "answers": [
    { "question_id": 3, "option_id": 12, "text_answer": null, "is_correct": true,  "points_earned": 1.0 },
    { "question_id": 5, "option_id": null, "text_answer": "O teorema de Pitágoras afirma que...", "is_correct": null, "points_earned": 0.0 }
  ]
}
```

> O campo `pending_answers_count` só aparece quando `status = "pending_review"`.

---

#### `PATCH /api/exam-attempts/{attempt}/answers/{answer}/correct`
Corrige manualmente uma resposta discursiva ou de questão com `allow_text_answer`. Exclusivo para admin/professor.

**Body:**
```json
{ "is_correct": true, "points_earned": 1.5 }
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `is_correct` | boolean | ✅ | Indica se a resposta está correta |
| `points_earned` | numeric | ❌ | Pontos atribuídos. Se omitido: usa `question.points` se correto, `0` se incorreto. Limitado a `question.points`. |

**Comportamento:**
- Salva `is_correct` e `points_earned` na resposta
- Verifica se ainda há respostas com `is_correct = null` na tentativa
- Quando **todas** forem corrigidas: recalcula `score` e `percentage`, muda `status` para `"completed"` ou `"awaiting_release"` (conforme a flag do simulado) e libera o resultado ao aluno apenas quando permitido

**Resposta `200` — ainda há pendências:**
```json
{
  "id": 7,
  "status": "pending_review",
  "pending_answers_count": 1,
  "score": null,
  "percentage": null
}
```

**Resposta `200` — última pendência corrigida (resultado liberado):**
```json
{
  "id": 7,
  "status": "completed",
  "score": 8.5,
  "max_score": 10.0,
  "percentage": 85.0,
  "passed": true
}
```

---

#### `GET /api/exam-attempts/{attempt}`
Retorna o resultado completo de uma tentativa, incluindo todas as respostas com `is_correct` e `points_earned`.

---

#### `GET /api/exam-attempts`
Lista tentativas com paginação.

**Query params:**

| Param | Tipo | Descrição |
|---|---|---|
| `exam_id` | integer | Filtra por simulado |
| `student_id` | integer | Filtra por aluno |
| `status` | string | `in_progress` \| `pending_review` \| `awaiting_release` \| `completed` |

> `pending_review` indica que o simulado foi entregue mas há respostas aguardando correção manual. `awaiting_release` indica que a correção já terminou, mas o resultado segue bloqueado até o fim do período. Nesse estado, o aluno ainda pode rever o que respondeu, porém sem gabarito, sem nota por questão e sem correção. O resultado completo só é visível quando `status = "completed"`.

> Internamente, `exam_attempts` usa `attempt_status_id` (FK para `exam_attempt_statuses`). Na API, o campo retornado continua sendo `status` (slug), para manter compatibilidade com frontend/mobile.

---

## Campos calculados na resposta

| Campo | Onde aparece | Descrição |
|---|---|---|
| `total_questions` | `ExamResource` | `questions()->count()` |
| `total_points` | `ExamResource` | soma de `questions.points` |
| `passed` | `ExamAttemptResource` | `percentage >= exam.passing_score` — só presente quando `status = "completed"` |
| `pending_answers_count` | `ExamAttemptResource` | nº de respostas ainda sem `is_correct` — só presente quando `status = "pending_review"` |
| `result_release_pending` | `ExamAttemptResource` | indica que a tentativa está corrigida, mas o resultado segue bloqueado (`status = "awaiting_release"`) |
| `hit_rate` | `stats.by_question` | `(correct_count / total_attempts) * 100` |

---

## Status de tentativas

| Status | Descrição |
|---|---|
| `in_progress` | Aluno ainda está realizando o simulado |
| `pending_review` | Simulado entregue; há respostas aguardando correção manual do admin. `score`, `percentage` e `passed` ficam `null`. |
| `awaiting_release` | Simulado já corrigido, mas a nota e o gabarito ficam ocultos ao aluno até `ends_at`. |
| `completed` | Todas as respostas corrigidas; resultado liberado. |

> **Regra de retentativa:** tentativas `pending_review` e `awaiting_release` bloqueiam o início de uma nova tentativa da mesma forma que `in_progress`. O aluno recebe: *"Este simulado já foi entregue e está aguardando liberação do resultado."*

## Liberação automática de resultado

Quando `release_results_after_end = true`, a tentativa entra em `awaiting_release` assim que toda a correção termina antes do fechamento do período. A liberação automática ocorre pelo comando agendado:

```bash
php artisan exams:release-pending-results
```

Esse comando promove tentativas `awaiting_release` para `completed` quando `exam.ends_at <= now()`.

## Campos de retentativa

Controlam se um aluno pode refazer o simulado após entregar. Configurados pelo admin no `POST /api/exams` ou `PUT /api/exams/{exam}`.

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `allow_retake` | boolean | `false` | `false` = não pode refazer. `true` = retentativa habilitada. |
| `max_attempts` | integer \| null | `null` | Limite de tentativas totais (inclui a primeira). `null` = ilimitado. |
| `min_score_to_retake` | decimal \| null | `null` | Aluno pode refazer enquanto nenhuma tentativa atingiu esta nota. Quando qualquer tentativa atinge o threshold, fica bloqueado **permanentemente**. `null` = usa `passing_score`. |

### Lógica de bloqueio (aplicada no `POST /api/exams/{exam}/start`)

```
Tentativa em andamento?              → 422 "já existe tentativa em andamento"
allow_retake = false?               → 422 "não permite novas tentativas"
max_attempts atingido?              → 422 "limite de N tentativas atingido"
Qualquer tentativa >= threshold?    → 422 "Você já foi aprovado. Não é possível realizar novamente."
senão                               → cria nova tentativa ✓
```

O `threshold` é `min_score_to_retake` quando definido; caso contrário usa `passing_score`.

> **Importante:** a verificação de aprovação é irreversível — verifica **todas** as tentativas concluídas, não só a última. Se o aluno passou em qualquer momento, fica permanentemente bloqueado.

---

## Modelos e relacionamentos

```
ExamStatus (domínio)
 └── hasMany Exam

ExamType (domínio)
 └── hasMany Exam

Exam
 ├── belongsTo ExamStatus
 ├── belongsTo ExamType
 ├── belongsTo Course
 ├── belongsTo Subject
 ├── hasMany ExamQuestion (ordered by `order`)
 └── hasMany ExamAttempt

ExamQuestion
 ├── belongsTo Exam
 ├── belongsTo Subject
 ├── hasMany ExamQuestionOption (ordered by `order`)
 └── hasMany ExamAnswer

ExamAttempt
 ├── belongsTo Exam
 ├── belongsTo Student
 └── hasMany ExamAnswer

ExamAnswer
 ├── belongsTo ExamAttempt
 ├── belongsTo ExamQuestion
 └── belongsTo ExamQuestionOption (nullable — discursivas)
```
