import type { SimuladoListItem } from '../../../services/simulados.service';
import { subjectColor, type ExamStatus, type Palette } from '../../../ui';

const DAY_MS = 86400000;

function diffDays(from: Date, to: Date) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.ceil((b - a) / DAY_MS);
}

const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
const weekday = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
const time = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Concluído (inclui aguardando correção/liberação: o aluno já entregou). */
export function isDone(s: SimuladoListItem) {
  return ['completed', 'pending_review', 'awaiting_release'].includes(s.attempt_status);
}

/** Encerrado sem ter feito (prazo acabou ou tempo esgotado). */
export function isClosed(s: SimuladoListItem) {
  return !isDone(s) && (s.attempt_status === 'abandoned' || s.period_closed === true || s.period_status === 'closed');
}

export function isUpcoming(s: SimuladoListItem) {
  return !isDone(s) && !isClosed(s) && (s.period_not_started === true || s.period_status === 'upcoming');
}

/** Dias até o fim do prazo (null sem prazo). */
export function daysLeft(s: SimuladoListItem, now = new Date()): number | null {
  if (!s.ends_at) return null;
  const end = new Date(s.ends_at);
  return end < now ? -1 : diffDays(now, end);
}

/** Prazo com dia e hora ("Até sex, 00:30"), nunca só "3 dias restantes". */
export function deadlineLabel(s: SimuladoListItem, now = new Date()): string | null {
  if (isUpcoming(s) && s.starts_at) {
    const start = new Date(s.starts_at);
    return `Abre ${weekday(start)}, ${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  }
  if (!s.ends_at || isDone(s)) return null;
  const end = new Date(s.ends_at);
  if (end < now) return 'Prazo encerrado';
  return `Até ${weekday(end)}, ${time(end)}`;
}

/** Props do ExamCard a partir do simulado da API. */
export function examCardProps(s: SimuladoListItem, palette: Palette) {
  const done = isDone(s);
  const closed = isClosed(s);
  const status: ExamStatus = done ? 'done' : closed ? 'late' : s.attempt_status === 'in_progress' ? 'progress' : 'available';
  const left = daysLeft(s);
  const statusText = s.attempt_status === 'pending_review' ? 'Aguardando correção'
    : s.attempt_status === 'awaiting_release' ? 'Aguardando liberação'
    : s.attempt_status === 'abandoned' ? 'Tempo esgotado'
    : isUpcoming(s) ? 'Em breve' : undefined;
  return {
    subject: s.subject?.name ?? s.exam_type_label ?? 'Simulado',
    subjectColor: subjectColor(palette, s.subject?.id, s.subject?.color),
    title: s.title,
    meta: [
      `${s.total_questions} ${s.total_questions === 1 ? 'questão' : 'questões'}`,
      s.duration_minutes ? `${s.duration_minutes} min` : 'Sem limite',
      s.passing_score ? `Mín. ${s.passing_score}%` : '',
    ].filter(Boolean),
    status,
    statusText,
    deadline: deadlineLabel(s),
    urgent: !done && !closed && left !== null && left >= 0 && left <= 3,
    score: s.aproveitamento != null ? fmtPct(s.aproveitamento) : s.score_display ?? undefined,
    scoreValue: s.aproveitamento ?? 0,
    minimum: s.passing_score ?? 50,
    actionLabel: done ? (s.attempt_status === 'completed' ? 'Ver correção' : 'Ver detalhes')
      : closed ? 'Ver gabarito'
      : isUpcoming(s) ? 'Ver detalhes' : undefined,
  };
}
