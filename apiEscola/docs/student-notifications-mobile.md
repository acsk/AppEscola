# Notificações in-app (admin → mobile)

Sistema de mensagens exibidas no **sino** do app mobile, com contagem de não lidas e marcação de lida ao abrir a mensagem.

## Tipos (`type`)

| Slug | Uso |
|------|-----|
| `general` | Comunicado geral da escola |
| `class_announcement` | Aviso de turma/curso |
| `billing_due` | Vencimento de cobrança |
| `exam_pending` | Simulado pendente |
| `exam_result` | Resultado disponível |

Metadados de ícone/rótulo: `GET /api/notifications/types` (painel).

## Público-alvo no envio (painel)

| `audience_type` | Campos obrigatórios |
|-----------------|---------------------|
| `tenant` | Todos os alunos ativos com login no app |
| `course` | `course_id` |
| `school_class` | `school_class_id` |
| `student` | `student_id` |
| `students` | `student_ids[]` |

Somente alunos **ativos**, com **`user_id`** (acesso ao app), entram no envio.

---

## Mobile (role `aluno`)

### Contagem para o badge do sino

```http
GET /api/aluno/notifications/unread-count
Authorization: Bearer {token}
```

```json
{
  "type": "success",
  "body": { "unread_count": 3 }
}
```

### Listagem

```http
GET /api/aluno/notifications?unread_only=0&page=1&per_page=20
```

Resposta (`body`):

- `items[]` — notificações
- `pagination` — paginação Laravel
- `unread_count` — total não lido (atualizado na listagem)

Cada item:

```json
{
  "id": 1,
  "type": "exam_pending",
  "type_label": "Simulado pendente",
  "type_icon": "assignment",
  "title": "Simulado de Matemática",
  "body": "Você ainda não realizou o simulado. Prazo: 25/05.",
  "data": { "exam_id": 12, "action": "open_exam" },
  "is_read": false,
  "read_at": null,
  "created_at": "2026-05-20T10:00:00.000000Z"
}
```

### Detalhe (marca como lida automaticamente)

```http
GET /api/aluno/notifications/{id}
```

### Marcar uma como lida (sem abrir detalhe)

```http
PATCH /api/aluno/notifications/{id}/read
```

### Marcar todas como lidas

```http
POST /api/aluno/notifications/read-all
```

---

## Painel admin

### Configuração — quais tipos podem ir ao calendário

Por tenant, em **Notificações → Configurações** (ou API):

```http
GET /api/notifications/settings
PUT /api/notifications/settings
```

Body do `PUT`:

```json
{
  "calendar_enabled_types": ["general", "exam_pending", "exam_result"]
}
```

Somente os tipos listados exibem a opção **“Exibir também no calendário”** ao enviar. Valores persistidos em `tenant_settings` (`module: notifications`).

### Tipos e públicos

```http
GET /api/notifications/types
```

Inclui `calendar_enabled_types` e `calendar_type_labels` do tenant atual.

### Pré-visualizar quantidade de destinatários

```http
POST /api/notifications/preview
```

Body igual ao envio (sem persistir).

### Enviar

```http
POST /api/notifications/send
```

Com **calendário** (sino + agenda do aluno):

```json
{
  "type": "exam_pending",
  "title": "Simulado Virtual de Matemática",
  "body": "Realize o simulado até o prazo final.",
  "audience_type": "course",
  "course_id": 3,
  "show_on_calendar": true,
  "starts_at": "2026-08-01T08:00:00",
  "ends_at": "2026-08-15T23:59:00",
  "data": { "exam_id": 12, "action": "open_exam" }
}
```

- `show_on_calendar` + `starts_at` / `ends_at` criam um evento na agenda (mesmo público da notificação).
- Tipos de notificação são mapeados para tipos do calendário (ex.: `exam_pending` → simulado).

Exemplo — turma (somente sino):

```json
{
  "type": "class_announcement",
  "title": "Aula cancelada amanhã",
  "body": "A aula de quinta foi remarcada para sexta às 19h.",
  "audience_type": "school_class",
  "school_class_id": 5,
  "data": { "action": "open_schedule" }
}
```

Exemplo — um aluno:

```json
{
  "type": "billing_due",
  "title": "Boleto vence amanhã",
  "body": "Sua mensalidade de maio vence em 21/05.",
  "audience_type": "student",
  "student_id": 42,
  "data": { "invoice_id": 100, "action": "open_finance" }
}
```

### Histórico de envios

```http
GET /api/notifications/broadcasts?page=1
GET /api/notifications/broadcasts/{id}
```

Permissões: `admin`, `super_admin`, `professor`.

---

## Sugestão de UX no mobile

1. Badge no sino = `unread_count` (atualizar ao focar na home ou pull-to-refresh).
2. Ao tocar na notificação → `GET .../{id}` → navegar conforme `data.action` / `exam_id` / `invoice_id`.
3. Botão "Marcar todas como lidas" → `POST read-all`.

## Envios automáticos (futuro)

O mesmo serviço (`StudentNotificationService`) pode ser chamado por jobs/commands para:

- cobranças próximas do vencimento (`billing_due`);
- simulados abertos não iniciados (`exam_pending`).

Não implementado nesta entrega — apenas API manual pelo painel.
