import type { ThemeColors } from '../../../theme';

export type ExamPeriodStatus = 'upcoming' | 'open' | 'closed';

export type ExamPeriodFields = {
  starts_at: string | null;
  ends_at: string | null;
  can_start?: boolean;
  period_status?: ExamPeriodStatus;
  period_closed?: boolean;
  period_not_started?: boolean;
  period_message?: string | null;
};

export function resolveExamPeriodStatus(exam: ExamPeriodFields): ExamPeriodStatus {
  if (exam.period_status) {
    return exam.period_status;
  }
  if (exam.period_not_started) {
    return 'upcoming';
  }
  if (exam.period_closed) {
    return 'closed';
  }
  if (exam.can_start === false) {
    const now = Date.now();
    if (exam.starts_at && new Date(exam.starts_at).getTime() > now) {
      return 'upcoming';
    }
    if (exam.ends_at && new Date(exam.ends_at).getTime() < now) {
      return 'closed';
    }
    return 'upcoming';
  }
  return 'open';
}

export function formatExamPeriodDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type PeriodStatusDisplay = {
  icon: string;
  label: string;
  text: string;
  bg: string;
  color: string;
};

export function getPeriodStatusDisplay(
  periodStatus: ExamPeriodStatus,
  exam: ExamPeriodFields,
  colors: ThemeColors,
): PeriodStatusDisplay {
  if (exam.period_message) {
    const base = periodStatus === 'upcoming'
      ? {
          icon: 'calendar-outline',
          label: 'Ainda não liberado',
          bg: '#FEF9C3',
          color: '#B45309',
        }
      : {
          icon: 'lock-closed-outline',
          label: 'Período encerrado',
          bg: '#F1F5F9',
          color: '#64748B',
        };
    return { ...base, text: exam.period_message };
  }

  if (periodStatus === 'upcoming') {
    const inicio = exam.starts_at ? formatExamPeriodDate(exam.starts_at) : null;
    return {
      icon: 'calendar-outline',
      label: 'Ainda não liberado',
      text: inicio
        ? `Este simulado estará disponível a partir de ${inicio}.`
        : 'Este simulado ainda não está liberado para início.',
      bg: '#FEF9C3',
      color: '#B45309',
    };
  }

  const fim = exam.ends_at ? formatExamPeriodDate(exam.ends_at) : null;
  return {
    icon: 'lock-closed-outline',
    label: 'Período encerrado',
    text: fim
      ? `O prazo para realização terminou em ${fim}.`
      : 'O prazo para realização deste simulado foi encerrado.',
    bg: '#F1F5F9',
    color: colors.muted,
  };
}

export function isPeriodBlockingStart(
  periodStatus: ExamPeriodStatus,
  attemptStatus: string,
): boolean {
  return (
    periodStatus !== 'open' &&
    (attemptStatus === 'not_started' || attemptStatus === 'abandoned')
  );
}

export function canShowExamPdf(
  periodStatus: ExamPeriodStatus,
  attemptStatus: string,
): boolean {
  if (attemptStatus === 'in_progress') return true;
  if (
    attemptStatus === 'completed' ||
    attemptStatus === 'pending_review' ||
    attemptStatus === 'awaiting_release'
  ) {
    return true;
  }
  return periodStatus === 'open';
}
