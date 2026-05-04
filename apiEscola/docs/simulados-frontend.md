# Simulados – Guia de Integração Frontend

Documento focado nos fluxos que o frontend precisa implementar para o módulo de simulados.

---

## O que mudou recentemente

Foi adicionado o campo `triggers_text_input` em cada opção de questão objetiva.

**Problema que resolve:** algumas questões possuem uma opção "Outro" (ou similar) onde o candidato precisa digitar manualmente o que quis dizer. Antes não havia forma de sinalizar isso — agora a própria API indica quais opções ativam esse comportamento.

**Impacto no frontend:** ao renderizar as opções de uma questão objetiva, verifique se a opção selecionada tem `triggers_text_input: true`. Se tiver, exiba um campo de texto abaixo das opções. Caso o candidato troque para outra opção normal, o campo deve ser ocultado e limpo.

Nenhuma outra mudança de fluxo foi necessária — o envio da resposta já aceitava `text_answer` junto com `option_id`.

---

## Tipos de questão

| `type` | O que renderizar |
|---|---|
| `multiple_choice` | Lista de opções (radio). Algumas opções podem ativar campo de texto — veja abaixo. |
| `essay` | Somente campo de texto livre (textarea). |

---

## Campo `triggers_text_input` nas opções

Cada opção de questão objetiva retorna o campo `triggers_text_input` (boolean).

| Valor | Comportamento esperado |
|---|---|
| `false` | Apenas seleciona a opção normalmente |
| `true` | Seleciona a opção **e exibe um campo de texto** para o candidato digitar |

> Este campo é retornado **sempre**, inclusive durante a realização da prova — o frontend não precisa fazer nenhuma chamada extra para saber se deve exibir o campo.

---

## Fluxo completo de realização de um simulado

```
1. GET  /api/exams/{exam}/questions    → carrega questões e opções (com triggers_text_input)
2. POST /api/exams/{exam}/start        → cria a tentativa, retorna attempt.id
3. POST /api/exam-attempts/{id}/answer → salva cada resposta (pode repetir quantas vezes quiser)
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
    "options": [
      { "id": 1, "option_text": "Internet",  "order": 1, "triggers_text_input": false },
      { "id": 2, "option_text": "Amigos",    "order": 2, "triggers_text_input": false },
      { "id": 3, "option_text": "Escola",    "order": 3, "triggers_text_input": false },
      { "id": 4, "option_text": "Outro",     "order": 4, "triggers_text_input": true  }
    ]
  },
  {
    "id": 2,
    "type": "multiple_choice",
    "question_text": "Qual é a raiz quadrada de 144?",
    "points": 1.0,
    "order": 2,
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
    "options": []
  }
]
```

> `is_correct` **não é retornado** nestas rotas — o gabarito é protegido durante a realização.

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

---

## 3. Salvar respostas

Chame este endpoint sempre que o candidato interagir com uma questão. Pode ser chamado múltiplas vezes — cada chamada faz um **upsert** pela combinação `attempt_id + question_id`, sobrescrevendo a resposta anterior.

```
POST /api/exam-attempts/{attempt_id}/answer
Authorization: Bearer {token}
Content-Type: application/json
```

### 3a. Questão objetiva — opção normal (`triggers_text_input: false`)

Envie apenas o `option_id` da opção selecionada:

```json
{ "question_id": 2, "option_id": 6 }
```

### 3b. Questão objetiva — opção "Outro" (`triggers_text_input: true`)

Quando o candidato selecionar uma opção com `triggers_text_input: true`, o campo de texto fica visível. Envie o `option_id` **e** o texto digitado pelo candidato:

```json
{
  "question_id": 1,
  "option_id": 4,
  "text_answer": "Soube pelo jornal do bairro."
}
```

> Se o candidato selecionar "Outro" mas não digitar nada, envie `text_answer: null` ou simplesmente omita o campo — a resposta será salva como pendente de texto.

### 3c. Questão discursiva (`type: essay`)

Sem opções — apenas o texto:

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
1. Corrige automaticamente todas as questões objetivas pela opção selecionada
2. Calcula `score`, `max_score` e `percentage`
3. Define `passed` com base na nota mínima do simulado
4. Respostas do tipo "Outro" e discursivas ficam com `is_correct: null` aguardando correção manual do professor

### Resposta `200`

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
    {
      "question_id": 1,
      "option_id": 4,
      "text_answer": "Soube pelo jornal do bairro.",
      "is_correct": null,
      "points_earned": 0.0
    },
    {
      "question_id": 2,
      "option_id": 6,
      "text_answer": null,
      "is_correct": true,
      "points_earned": 1.0
    },
    {
      "question_id": 3,
      "option_id": null,
      "text_answer": "O teorema de Pitágoras afirma que...",
      "is_correct": null,
      "points_earned": 0.0
    }
  ]
}
```

### O que esperar por cenário após o `/finish`

| Cenário | `is_correct` | `points_earned` | Observação |
|---|---|---|---|
| Objetiva — opção normal | `true` ou `false` | Calculado automaticamente | Corrigido na hora |
| Objetiva — opção "Outro" + texto | `null` | `0` | Aguarda correção manual do professor |
| Discursiva | `null` | `0` | Aguarda correção manual do professor |

> **`passed`** é `true` quando `percentage >= passing_score` do simulado. Retorna `null` se o simulado não tiver nota mínima configurada.

---

## Lógica de renderização (resumo para implementação)

```
se question.type === 'essay':
  → renderizar somente <textarea>

se question.type === 'multiple_choice':
  → renderizar lista de <radio> com as options
  → ao usuário selecionar uma opção:
      se option.triggers_text_input === true
          → exibir <textarea> abaixo (placeholder: "Especifique...")
          → ao salvar: enviar { question_id, option_id, text_answer }
      senão
          → ocultar e limpar o textarea
          → ao salvar: enviar { question_id, option_id }
```

---

## Erros comuns

| Código HTTP | Causa | Como tratar no UI |
|---|---|---|
| `422` | Tentativa já em andamento para este aluno | Buscar tentativa existente e retomar |
| `422` | Simulado não está `published` | Exibir aviso "Simulado indisponível" |
| `422` | Tentativa já finalizada ao tentar responder | Bloquear interação e redirecionar para resultado |
| `401` | Token expirado | Redirecionar para login |
