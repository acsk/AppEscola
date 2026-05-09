# Simulados – Guia de Integração Frontend

Documento focado nos fluxos que o frontend precisa implementar para o módulo de simulados.

---

## Changelog

| Data | O que mudou |
|---|---|
| 2026-05-09 | Enunciado da questão: pode ser texto, imagem ou ambos (mínimo obrigatório: 1 dos 2) |
| 2026-05-04 | Campos de retentativa: `allow_retake`, `max_attempts`, `min_score_to_retake` |
| 2026-05-04 | `subject` agora retorna `icon` e `color` |
| 2026-05-03 | `starts_at` / `ends_at` adicionados ao simulado |
| 2026-05-03 | Campo `triggers_text_input` nas opções de questão objetiva |
| 2026-05-03 | Campo `allow_text_answer` nas questões objetivas |

---

## Tipos de questão

| `type` | O que renderizar |
|---|---|
| `multiple_choice` | Lista de opções (radio). Algumas opções podem ativar campo de texto — veja abaixo. |
| `essay` | Somente campo de texto livre (textarea). |

---

## Fluxo completo de realização de um simulado

```
1. GET  /api/exams/{exam}/questions    → carrega questões e opções
2. POST /api/exams/{exam}/start        → cria a tentativa, retorna attempt.id
3. POST /api/exam-attempts/{id}/answer → salva cada resposta (upsert — pode repetir)
4. POST /api/exam-attempts/{id}/finish → finaliza e retorna resultado com pontuação
```

---

## 1. Buscar questões

```
GET /api/exams/{exam}/questions
Authorization: Bearer {token}
```

### Resposta

```json
[
  {
    "id": 1,
    "type": "multiple_choice",
    "question_text": "Como você ficou sabendo do nosso vestibular?",
    "image_url": null,
    "video_url": null,
    "points": 1.0,
    "order": 1,
    "allow_text_answer": false,
    "options": [
      { "id": 1, "option_text": "Internet", "order": 1, "triggers_text_input": false },
      { "id": 2, "option_text": "Amigos",   "order": 2, "triggers_text_input": false },
      { "id": 3, "option_text": "Escola",   "order": 3, "triggers_text_input": false },
      { "id": 4, "option_text": "Outro",    "order": 4, "triggers_text_input": true  }
    ]
  },
  {
    "id": 2,
    "type": "multiple_choice",
    "question_text": "Qual é a raiz quadrada de 144?",
    "points": 1.0,
    "order": 2,
    "allow_text_answer": true,
    "options": [
      { "id": 5, "option_text": "10", "order": 1, "triggers_text_input": false },
      { "id": 6, "option_text": "12", "order": 2, "triggers_text_input": false },
      { "id": 7, "option_text": "14", "order": 3, "triggers_text_input": false },
      { "id": 8, "option_text": "16", "order": 4, "triggers_text_input": false }
    ]
  },
  {
    "id": 3,
    "type": "essay",
    "question_text": "Explique o Teorema de Pitágoras.",
    "points": 2.0,
    "order": 3,
    "allow_text_answer": true,
    "options": []
  }
]
```

> `is_correct` **não é retornado** nestas rotas — o gabarito é protegido durante a realização.

### Campos de questão relevantes para renderização

| Campo | Tipo | Descrição |
|---|---|---|
| `type` | string | `multiple_choice` ou `essay` |
| `question_text` | string \| null | Enunciado textual. Pode vir `null` quando a questão usa apenas imagem |
| `image_url` | string \| null | Imagem do enunciado. Pode vir `null` quando a questão usa apenas texto |
| `allow_text_answer` | boolean | Questão objetiva que também exige justificativa escrita |
| `options[].triggers_text_input` | boolean | Opção que, quando selecionada, exibe campo de texto |

> Regra de conteúdo do enunciado: a API garante que cada questão tenha pelo menos um entre `question_text` e `image_url`.

### Upload da imagem do enunciado

Para cadastrar a imagem da questão, o frontend deve oferecer um campo de upload de arquivo e não apenas um campo de URL manual.

```
POST /api/exams/{exam}/questions/upload-image
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `image` | file | ✅ | `jpg`, `jpeg`, `png`, `webp`, `gif`, máximo 5MB |

### Resposta `201`

```json
{
  "message": "Imagem enviada com sucesso.",
  "image_url": "http://localhost:4000/storage/exam-questions/1/3/arquivo.png",
  "path": "exam-questions/1/3/arquivo.png"
}
```

> O frontend deve enviar o arquivo via upload, receber a `image_url` da API e preencher o campo `image_url` da questão com esse valor.

> Caso a questão seja apenas de imagem, o texto do enunciado pode ficar vazio. Caso tenha texto e imagem, ambos podem ser enviados.

---

## 2. Iniciar tentativa

```
POST /api/exams/{exam}/start
Authorization: Bearer {token}
Content-Type: application/json

{ "student_id": 4 }
```

### Resposta `201`

```json
{
  "id": 7,
  "exam_id": 1,
  "student_id": 4,
  "status": "in_progress",
  "started_at": "2026-05-03T14:00:00.000Z",
  "max_score": 10.0,
  "answers": []
}
```

> Guarde o `id` da tentativa — ele é usado em todas as chamadas seguintes.

### Erros ao iniciar (`422`)

| Mensagem | Causa |
|---|---|
| "Este simulado já foi entregue e não permite novas tentativas." | `allow_retake = false` e aluno já completou uma tentativa |
| "Número máximo de tentativas (N) atingido." | `max_attempts` atingido |
| "Você já foi aprovado neste simulado. Não é possível realizá-lo novamente." | **Qualquer** tentativa anterior atingiu o threshold — bloqueio permanente |
| "Já existe uma tentativa em andamento para este simulado." | Retomar tentativa existente |
| "O prazo para realização deste simulado foi encerrado." | Após `ends_at` |
| "Este simulado ainda não está disponível." | Antes de `starts_at` |

---

## 3. Salvar respostas

Chame este endpoint sempre que o candidato interagir com uma questão. Pode ser chamado múltiplas vezes — cada chamada faz um **upsert** pela combinação `attempt_id + question_id`.

```
POST /api/exam-attempts/{attempt_id}/answer
Authorization: Bearer {token}
Content-Type: application/json
```

### 3a. Questão objetiva — opção normal (`triggers_text_input: false`)

```json
{ "question_id": 2, "option_id": 6 }
```

### 3b. Questão objetiva com opção "Outro" (`triggers_text_input: true`)

```json
{ "question_id": 1, "option_id": 4, "text_answer": "Soube pelo jornal do bairro." }
```

### 3c. Questão objetiva com justificativa (`allow_text_answer: true`)

```json
{ "question_id": 2, "option_id": 6, "text_answer": "Justificativa da resposta." }
```

### 3d. Questão discursiva (`type: essay`)

```json
{ "question_id": 3, "text_answer": "O teorema de Pitágoras afirma que..." }
```

### Resposta `200`

```json
{ "message": "Resposta salva." }
```

---

## 4. Finalizar tentativa

```
POST /api/exam-attempts/{attempt_id}/finish
Authorization: Bearer {token}
```

Ao chamar este endpoint a API:
1. Corrige automaticamente as questões objetivas **puras** (`allow_text_answer = false`)
2. Questões discursivas e questões com `allow_text_answer = true` ficam pendentes de correção manual

### O `status` da resposta determina o que exibir

| `status` retornado | Significado | O que exibir no frontend |
|---|---|---|
| `"completed"` | Todas as respostas corrigidas automaticamente | Exibir resultado completo (nota, aprovado/reprovado) |
| `"pending_review"` | Há respostas aguardando correção manual do admin | Exibir mensagem de aguardo |

---

### Resposta `200` — `status: "completed"` (somente objetivas puras)

```json
{
  "id": 7,
  "status": "completed",
  "started_at": "2026-05-03T14:00:00.000Z",
  "finished_at": "2026-05-03T14:45:00.000Z",
  "score": 8.0,
  "max_score": 10.0,
  "percentage": 80.0,
  "passed": true,
  "answers": [
    { "question_id": 2, "option_id": 6, "text_answer": null, "is_correct": true,  "points_earned": 1.0 },
    { "question_id": 3, "option_id": 8, "text_answer": null, "is_correct": false, "points_earned": 0.0 }
  ]
}
```

**→ Exibir tela de resultado:** nota obtida, percentual, se passou ou não.

---

### Resposta `200` — `status: "pending_review"` (há discursivas ou `allow_text_answer`)

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
    { "question_id": 2, "option_id": 6, "text_answer": null, "is_correct": true,  "points_earned": 1.0 },
    { "question_id": 3, "option_id": null, "text_answer": "O teorema de Pitágoras afirma que...", "is_correct": null, "points_earned": 0.0 }
  ]
}
```

**→ Exibir mensagem de aguardo**, por exemplo:

> "Seu simulado foi entregue! Algumas respostas precisam ser corrigidas pelo professor. Você será notificado quando o resultado estiver disponível."

O campo `pending_answers_count` indica quantas respostas ainda aguardam correção.

---

### Como verificar o resultado depois

O aluno pode consultar `GET /api/exam-attempts/{id}` para checar se o resultado já foi liberado:

```
se status === "completed"   → exibir resultado
se status === "pending_review" → exibir mensagem de aguardo
```

---

### O que esperar por resposta após o `/finish`

| Cenário | `is_correct` | `points_earned` | Efeito no `status` |
|---|---|---|---|
| Objetiva pura — selecionou opção | `true` ou `false` | Calculado automaticamente | — |
| Objetiva com `allow_text_answer` | `null` | `0` | → `pending_review` |
| Objetiva — opção "Outro" + texto | `null` | `0` | → `pending_review` |
| Discursiva | `null` | `0` | → `pending_review` |

> **`passed`** só é retornado quando `status = "completed"`. Enquanto `pending_review`, retorna `null`.

---

## 5. Campos de retentativa no simulado

O objeto do simulado agora inclui três campos que controlam se o aluno pode refazer após entregar:

```json
{
  "allow_retake": true,
  "max_attempts": 3,
  "min_score_to_retake": 70.0
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `allow_retake` | boolean | `false` = não pode refazer (padrão). `true` = admin habilitou retentativa. |
| `max_attempts` | integer \| null | Limite de tentativas totais. `null` = ilimitado (só válido quando `allow_retake: true`). |
| `min_score_to_retake` | decimal \| null | Enquanto `percentage < min_score_to_retake`, pode refazer. Uma vez aprovado, fica bloqueado permanentemente. `null` = usa `passing_score` como referência. |

### Como usar no frontend

Após o `/finish`, com base nos campos do simulado:

```
allow_retake = false
  → Ocultar botão "Refazer". Exibir somente resultado.

allow_retake = true
  → Verificar se pode refazer:
       qualquer tentativa >= threshold?  → Bloquear permanentemente ("Você já foi aprovado!")
       tentativas feitas >= max_attempts? → Bloquear ("Limite de tentativas atingido")
       senão                              → Exibir botão "Tentar novamente"
```

> O backend também rejeita a tentativa com `422` se as regras não forem atendidas — o frontend deve tratar o erro e exibir `body.errors.exam_id[0]`.

---

## 6. Campo `subject` com ícone e cor

O objeto do simulado inclui o `subject` com `icon` e `color` para exibição visual:

```json
"subject": {
  "id": 2,
  "name": "Matemática",
  "icon": "calculator",
  "color": "#3B82F6"
}
```

Use `color` como cor de fundo/destaque do card e `icon` para renderizar o ícone da disciplina.

---

## Lógica de renderização das questões (resumo)

```
se question.type === 'essay':
  → renderizar somente <textarea>

se question.type === 'multiple_choice':
  → renderizar lista de <radio> com as options
  → ao usuário selecionar uma opção:
       se option.triggers_text_input === true
           → exibir <textarea> (placeholder: "Especifique...")
           → ao salvar: enviar { question_id, option_id, text_answer }
       senão se question.allow_text_answer === true
           → exibir <textarea> (placeholder: "Justificativa...")
           → ao salvar: enviar { question_id, option_id, text_answer }
       senão
           → ocultar e limpar o textarea
           → ao salvar: enviar { question_id, option_id }
```

---

## Erros comuns

| Código HTTP | Causa | Como tratar no UI |
|---|---|---|
| `422` | Tentativa já em andamento | Buscar tentativa existente e retomar |
| `422` | Simulado não está `published` | Exibir aviso "Simulado indisponível" |
| `422` | Não permite novas tentativas | Exibir resultado da última tentativa |
| `422` | Máximo de tentativas atingido | Bloquear botão "Refazer" |
| `422` | Aluno já aprovado (bloqueio permanente) | Exibir "Parabéns, você já foi aprovado!" e ocultar botão |
| `422` | Tentativa já finalizada ao tentar responder | Bloquear interação e redirecionar para resultado |
| `422` | Fora do período (`starts_at`/`ends_at`) | Exibir datas de disponibilidade |
| `401` | Token expirado | Redirecionar para login |
