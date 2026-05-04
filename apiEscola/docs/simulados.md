# Módulo de Simulados

Permite criar simulados com questões objetivas e/ou discursivas, classificados por matéria e curso (ex.: Matemática → ENEM). Alunos realizam tentativas e recebem pontuação automática; endpoints de estatísticas e ranking fornecem os dados para gráficos.

---

## Tabelas

| Tabela | Descrição |
|---|---|
| `exam_statuses` | Domínio: estados possíveis de um simulado |
| `exam_types` | Domínio: tipos de simulado (ENEM, vestibular, etc.) |
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
      "total_questions": 10,
      "total_points": 10.0,
      "course": { "id": 2, "name": "ENEM" },
      "subject": { "id": 5, "name": "Matemática" }
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
  "passing_score": 60
}
```

| Campo | Tipo | Obrigatório |
|---|---|---|
| `title` | string | ✅ |
| `exam_type` | slug (ver tabela `exam_types`) | ❌ (default: `custom`) |
| `status` | slug (ver tabela `exam_statuses`) | ❌ (default: `draft`) |
| `course_id` | integer | ❌ |
| `subject_id` | integer | ❌ |
| `description` | string | ❌ |
| `duration_minutes` | integer | ❌ |
| `passing_score` | numeric | ❌ |

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

#### `POST /api/exams/{exam}/questions`
Adiciona uma questão ao simulado.

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
| `question_text` | string | ✅ |
| `subject_id` | integer | ❌ |
| `points` | numeric | ❌ (default: `1.0`) |
| `order` | integer | ❌ (auto-incremento) |
| `image_url` | url | ❌ |
| `video_url` | url | ❌ |
| `explanation` | string | ❌ |
| `options` | array | ✅ se `type = multiple_choice` |
| `options[].option_text` | string | ✅ |
| `options[].is_correct` | boolean | ✅ |
| `options[].triggers_text_input` | boolean | ❌ (default: `false`) — quando selecionada, exibe campo de texto livre |
| `options[].order` | integer | ❌ |
| `allow_text_answer` | boolean | ❌ (default: `false`) — habilita campo textual em questões objetivas |

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

---

#### `DELETE /api/exams/{exam}/questions/{question}`
Remove a questão (soft-delete). Opções são excluídas em cascata.

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
Finaliza a tentativa, calcula pontuação automática para questões objetivas.  
Questões discursivas **e questões objetivas híbridas** (`allow_text_answer = true`) têm o texto salvo com `is_correct = null` e `points_earned = 0`, aguardando correção manual. A opção selecionada na parte objetiva ainda é corrigida automaticamente.

**Resposta `200`:** tentativa com `status = completed`, `score`, `percentage` e `passed`.

```json
{
  "id": 7,
  "exam_id": 1,
  "exam": { "id": 1, "title": "Simulado ENEM – Matemática" },
  "student_id": 4,
  "student": { "id": 4, "name": "João Silva" },
  "status": "completed",
  "started_at": "2026-05-03T14:00:00.000Z",
  "finished_at": "2026-05-03T14:45:00.000Z",
  "score": 8.5,
  "max_score": 10.0,
  "percentage": 85.0,
  "passed": true,
  "answers": [
    {
      "question_id": 3,
      "option_id": 12,
      "text_answer": null,
      "is_correct": true,
      "points_earned": 1.0
    },
    {
      "question_id": 5,
      "option_id": null,
      "text_answer": "O teorema de Pitágoras afirma que...",
      "is_correct": null,
      "points_earned": 0.0
    }
  ],
  "created_at": "2026-05-03T14:00:00.000Z",
  "updated_at": "2026-05-03T14:45:00.000Z"
}
```

> Questões discursivas **e objetivas respondidas apenas com `text_answer`** retornam `is_correct: null` e `points_earned: 0` até serem corrigidas manualmente.

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
| `status` | string | `in_progress` \| `completed` |

> O campo `status` de tentativas é uma string simples (não usa tabela de domínio).

---

## Campos calculados na resposta

| Campo | Onde aparece | Descrição |
|---|---|---|
| `total_questions` | `ExamResource` | `questions()->count()` |
| `total_points` | `ExamResource` | soma de `questions.points` |
| `passed` | `ExamAttemptResource` | `percentage >= exam.passing_score` |
| `hit_rate` | `stats.by_question` | `(correct_count / total_attempts) * 100` |

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
