# Formação de Turmas — API

> Atualizado em 29/04/2026

---

## Visão Geral

Uma **turma** (`school_class`) é vinculada a um curso e pode ter múltiplos **horários** (`class_schedules`). Os horários já vêm embutidos na resposta da turma para evitar requisições extras.

---

## Domínios de Referência

Endpoints públicos (sem autenticação) para preencher selects.

| Endpoint | Uso |
|---|---|
| `GET /api/domains/periods` | Períodos (manhã, tarde, noite) |
| `GET /api/domains/weekdays` | Dias da semana para os horários |
| `GET /api/domains/statuses` | Status da turma (active, inactive…) |

**`GET /api/domains/periods`**
```json
[
  { "slug": "morning",   "name": "Manhã"    },
  { "slug": "afternoon", "name": "Tarde"    },
  { "slug": "night",     "name": "Noite"    },
  { "slug": "full_time", "name": "Integral" }
]
```

**`GET /api/domains/weekdays`**
```json
[
  { "slug": "monday",    "name": "Segunda-feira", "order": 1 },
  { "slug": "tuesday",   "name": "Terça-feira",   "order": 2 },
  { "slug": "wednesday", "name": "Quarta-feira",  "order": 3 },
  { "slug": "thursday",  "name": "Quinta-feira",  "order": 4 },
  { "slug": "friday",    "name": "Sexta-feira",   "order": 5 },
  { "slug": "saturday",  "name": "Sábado",        "order": 6 },
  { "slug": "sunday",    "name": "Domingo",       "order": 7 }
]
```

---

## Turmas

### `GET /api/school-classes`
> Requer autenticação Bearer Token

Lista paginada de turmas com curso e horários embutidos.

**Query params (todos opcionais):**

| Param | Tipo | Descrição |
|---|---|---|
| `course_id` | integer | Filtrar por curso |
| `year` | integer | Filtrar por ano |
| `period` | string | Slug do período (`morning`, `afternoon`…) |
| `status` | string | Slug do status (`active`, `inactive`…) |
| `search` | string | Busca parcial pelo nome da turma |
| `page` | integer | Página (20 itens por página) |

**Resposta (200):**
```json
{
  "data": [
    {
      "id": 5,
      "tenant_id": 1,
      "course_id": 4,
      "course": {
        "id": 4,
        "name": "CPM - PORT/MAT",
        "description": "Curso Preparatório Militar",
        "status": "active"
      },
      "name": "TURMA 1",
      "year": 2026,
      "period": "afternoon",
      "capacity": 20,
      "start_date": "2026-02-01",
      "end_date": "2026-12-15",
      "status": "active",
      "schedules": [
        {
          "id": 1,
          "weekday": "monday",
          "start_time": "14:00:00",
          "end_time": "15:30:00",
          "room": "Sala 2",
          "subject_id": null,
          "teacher_id": null
        },
        {
          "id": 2,
          "weekday": "wednesday",
          "start_time": "14:00:00",
          "end_time": "15:30:00",
          "room": "Sala 2",
          "subject_id": null,
          "teacher_id": null
        }
      ],
      "created_at": "2026-04-28T16:32:46.000000Z",
      "updated_at": "2026-04-29T01:00:53.000000Z"
  ],
  "links": { "first": "...", "last": "...", "prev": null, "next": null },
  "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 4 }
}
```

---

### `POST /api/school-classes`
> Requer autenticação Bearer Token

**Body:**
```json
{
  "course_id":  4,
  "name":       "TURMA 1",
  "start_date": "2026-02-01",
  "end_date":   "2026-12-15",
  "year":       2026,
  "period":     "afternoon",
  "capacity":   20,
  "status":     "active"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `course_id` | integer | **Sim** | ID do curso |
| `name` | string | **Sim** | Nome da turma (max 255) |
| `start_date` | date | **Sim** | Data de início da turma (`YYYY-MM-DD`) |
| `end_date` | date | **Sim** | Data de encerramento da turma (`YYYY-MM-DD`) — deve ser após `start_date` |
| `year` | integer | Não | Ano letivo (2000–2100) |
| `period` | string | Não | Slug de `domain_periods` |
| `capacity` | integer | Não | Capacidade máxima de alunos |
| `status` | string | Não | Slug de `domain_statuses`. Default: `active` |

> ⚠️ **`start_date` e `end_date` são obrigatórios** e serão herdados automaticamente pelas matrículas feitas nessa turma — não é preciso informar as datas novamente ao matricular.

**Resposta (201):** objeto da turma com `schedules: []` (array vazio até adicionar horários).

---

### `GET /api/school-classes/{id}`
> Requer autenticação Bearer Token

Retorna a turma completa com curso e horários.

---

### `PUT /api/school-classes/{id}`
> Requer autenticação Bearer Token

Body idêntico ao `POST` (`start_date` e `end_date` são opcionais no update; demais campos também).

---

### `DELETE /api/school-classes/{id}`
> Requer autenticação Bearer Token

```json
{ "message": "Turma removida com sucesso." }
```

---

## Horários da Turma

Os horários também vêm embutidos em `schedules[]` na resposta da turma. Use os endpoints abaixo para **criar, editar e remover** horários individualmente.

### `GET /api/school-classes/{id}/schedules`
> Requer autenticação Bearer Token

**Query params:**

| Param | Tipo | Descrição |
|---|---|---|
| `weekday` | string | Filtrar por dia da semana (slug) |

---

### `POST /api/school-classes/{id}/schedules`
> Requer autenticação Bearer Token

**Body:**
```json
{
  "weekday":    "monday",
  "start_time": "14:00",
  "end_time":   "15:30",
  "room":       "Sala 2",
  "subject_id": null,
  "teacher_id": null
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `weekday` | string | Sim | Slug de `domain_weekdays` |
| `start_time` | string | Sim | Formato `HH:MM` |
| `end_time` | string | Sim | Formato `HH:MM`, deve ser após `start_time` |
| `room` | string | Não | Nome/número da sala (max 100) |
| `subject_id` | integer | Não | ID da disciplina |
| `teacher_id` | integer | Não | ID do professor (user) |

**Resposta (201):**
```json
{
  "id": 3,
  "school_class_id": 5,
  "weekday": "monday",
  "start_time": "14:00:00",
  "end_time": "15:30:00",
  "room": "Sala 2",
  "subject_id": null,
  "subject": null,
  "teacher_id": null,
  "teacher": null
}
```

---

### `PUT /api/class-schedules/{scheduleId}`
> Requer autenticação Bearer Token

Body idêntico ao `POST` (todos os campos opcionais no update).

---

### `DELETE /api/class-schedules/{scheduleId}`
> Requer autenticação Bearer Token

```json
{ "message": "Horário removido com sucesso." }
```

---

## Fluxo Frontend — Criar Turma com Horários

```
1. Carregar selects
   GET /api/domains/periods      → opções de período
   GET /api/domains/weekdays     → opções de dias da semana
   GET /api/courses              → lista de cursos disponíveis

2. Criar a turma  ← informar start_date e end_date obrigatoriamente
   POST /api/school-classes
   Body mínimo:
   {
     "course_id":  1,
     "name":       "Turma Manhã 2026",
     "start_date": "2026-02-01",
     "end_date":   "2026-12-15"
   }
   → recebe turma com schedules: []

3. Adicionar os horários (um por dia)
   POST /api/school-classes/{id}/schedules   (repete para cada dia)

4. Na listagem, exibir turma com horários já embutidos
   GET /api/school-classes
   → cada turma traz schedules[] com todos os horários
```

---

## Fluxo Frontend — Editar Horários de uma Turma Existente

```
1. Carregar a turma
   GET /api/school-classes/{id}
   → schedules[] já vem com todos os horários cadastrados

2. Para editar um horário existente
   PUT /api/class-schedules/{scheduleId}

3. Para remover um horário
   DELETE /api/class-schedules/{scheduleId}

4. Para adicionar novo horário
   POST /api/school-classes/{id}/schedules
```

---

## Exibindo o nome do dia em português

Use `domain_weekdays` como dicionário de lookup:

```js
const weekdays = await api.get('/api/domains/weekdays')
const weekdayLabel = Object.fromEntries(weekdays.map(w => [w.slug, w.name]))
// { monday: 'Segunda-feira', tuesday: 'Terça-feira', ... }

// Uso na exibição
schedule.weekday_label = weekdayLabel[schedule.weekday]
// "Segunda-feira"
```
