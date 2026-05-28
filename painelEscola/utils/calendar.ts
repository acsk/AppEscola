/** Utilitários de calendário (pt-BR) para o painel web. */

export const WEEKDAY_LABELS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export type CalendarDayCell = {
  date: Date;
  inCurrentMonth: boolean;
};

/** Evita deslocamento por fuso ao montar datas só com dia/mês/ano. */
export function dateFromParts(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function startOfDay(date: Date): Date {
  return dateFromParts(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function parseDisplayDate(display: string): Date | null {
  const trimmed = display.trim();
  if (trimmed.length < 10) return null;
  const [dayStr, monthStr, yearStr] = trimmed.split("/");
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = dateFromParts(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseIsoDate(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return dateFromParts(y, m - 1, d);
}

export function formatMonthYear(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`;
}

export function addMonths(date: Date, delta: number): Date {
  return dateFromParts(date.getFullYear(), date.getMonth() + delta, 1);
}

/** Grade de 42 células (6 semanas) para o mês visível. */
export function buildMonthGrid(viewYear: number, viewMonthIndex: number): CalendarDayCell[] {
  const firstOfMonth = dateFromParts(viewYear, viewMonthIndex, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonthIndex + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonthIndex, 0).getDate();

  const cells: CalendarDayCell[] = [];

  for (let i = startWeekday - 1; i >= 0; i -= 1) {
    const day = daysInPrevMonth - i;
    cells.push({
      date: dateFromParts(viewYear, viewMonthIndex - 1, day),
      inCurrentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: dateFromParts(viewYear, viewMonthIndex, day),
      inCurrentMonth: true,
    });
  }

  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({
      date: dateFromParts(viewYear, viewMonthIndex + 1, nextDay),
      inCurrentMonth: false,
    });
    nextDay += 1;
  }

  return cells;
}

export function isDateBefore(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() < startOfDay(b).getTime();
}

export function isDateAfter(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() > startOfDay(b).getTime();
}

export function isDateDisabled(date: Date, minDate?: Date, maxDate?: Date): boolean {
  if (minDate && isDateBefore(date, minDate)) return true;
  if (maxDate && isDateAfter(date, maxDate)) return true;
  return false;
}
