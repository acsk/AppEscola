# Calendário / eventos

Agenda integrada ao app mobile e ao painel. Simulados **publicados** com `starts_at` e/ou `ends_at` geram eventos automaticamente.

## Deploy (obrigatório após atualizar a API)

```bash
php artisan migrate
php artisan calendar:sync-exams
php artisan calendar:sync-invoices
```

A migration `2026_05_21_000003_add_calendar_fields_to_notification_broadcasts_table` adiciona `show_on_calendar`, `starts_at` e `ends_at` em `notification_broadcasts`. Sem ela, o envio de notificação com calendário falha com *Unknown column 'show_on_calendar'*.

## Sincronização com simulados

- Observer em `Exam` chama `ExamCalendarSyncService` ao salvar/remover.
- Tipo `exam` (online) ou `exam_presential` (tipo de simulado `presencial`).
- Título: `Simulado: …` ou `Simulado presencial: …`
- Público: curso do simulado (`audience_type: course`).
- Eventos de simulado **não são editáveis** no calendário — altere o simulado.

Backfill de simulados já existentes:

```bash
php artisan calendar:sync-exams
```

## Sincronização com cobranças

- Observer em `Invoice` sincroniza cobranças **em aberto** com `due_date` e `student_id`.
- Tipo `billing`, dia inteiro na data de vencimento.
- Visível apenas para o **aluno** da cobrança (`audience_type: student`).
- Ao marcar como **paga** ou **cancelada**, o evento sai do calendário.

Backfill:

```bash
php artisan calendar:sync-invoices
```

## Sincronização com notificações

Ao enviar uma notificação pelo painel com **“Exibir também no calendário”** (`show_on_calendar` + `starts_at` / `ends_at`):

- `NotificationCalendarSyncService` cria/atualiza um `CalendarEvent` com `source_type: notification_broadcast`.
- Mesmo público da notificação (curso, turma, aluno(s), escola).
- Tipo no calendário conforme `config/student_notifications.php` → `calendar_type_map` (ex.: `exam_pending` → `exam`).
- Eventos de notificação **não são editáveis** no calendário — reenvie ou ajuste no envio de notificações.

Ver também: `docs/student-notifications-mobile.md`.

## Tipos de evento manual

| type | Uso |
|------|-----|
| `school` | Evento da escola |
| `class` | Aula / turma |
| `task` | Tarefa do aluno |
| `exam_presential` | Simulado presencial (manual) |
| `general` | Geral |

## API

### Painel

- `GET /api/calendar-events/types`
- `GET /api/calendar-events?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/calendar-events`
- `PUT /api/calendar-events/{id}` (somente manuais)
- `DELETE /api/calendar-events/{id}` (somente manuais)

### Mobile (aluno)

- `GET /api/aluno/calendar-events/types` — metadados (label, cor) para legenda
- `GET /api/aluno/calendar-events?from=&to=`

Resposta: `{ from, to, items[] }` com `type_color`, `exam_id` / `invoice_id` (quando sincronizado), etc.

## Mobile UX

- **Home:** widget semanal (`WeeklyCalendarWidget`)
- **Menu / link:** tela `Calendario` com visão mensal + agenda do dia
- Toque em evento de simulado → detalhe do simulado

## Painel UX

- Menu **Calendário** — grade mensal, agenda do dia, criar/editar eventos manuais
