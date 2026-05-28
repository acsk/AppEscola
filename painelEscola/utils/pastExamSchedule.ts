import { displayToISO, isoToDisplay } from "./masks";

export type PastExamScheduleMode = "year" | "date" | "none";

export type PastExamScheduleValue = {
  mode: PastExamScheduleMode;
  exam_year: string;
  exam_date: string;
};

export function buildYearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const options: { value: string; label: string }[] = [];
  for (let year = currentYear; year >= 1990; year -= 1) {
    options.push({ value: String(year), label: String(year) });
  }
  return options;
}

/** Registro antigo gravado só com exam_year ou com 01/01/AAAA. */
export function isYearOnlyStored(row: {
  exam_date?: string | null;
  exam_year?: number | null;
}): boolean {
  if (row.exam_year != null && !row.exam_date) {
    return true;
  }
  if (row.exam_date?.match(/^(\d{4})-01-01$/)) {
    return true;
  }
  return false;
}

export function scheduleFromPastExamRow(row: {
  exam_date?: string | null;
  exam_year?: number | null;
}): PastExamScheduleValue {
  if (isYearOnlyStored(row)) {
    const year =
      row.exam_year != null
        ? String(row.exam_year)
        : row.exam_date?.slice(0, 4) ?? "";
    return { mode: "year", exam_year: year, exam_date: "" };
  }

  if (row.exam_date) {
    return {
      mode: "date",
      exam_year: "",
      exam_date: isoToDisplay(row.exam_date) ?? "",
    };
  }

  return { mode: "none", exam_year: "", exam_date: "" };
}

export function defaultScheduleForMaterial(
  materialKind: "prova" | "exercicio",
): PastExamScheduleValue {
  return materialKind === "prova"
    ? { mode: "year", exam_year: "", exam_date: "" }
    : { mode: "none", exam_year: "", exam_date: "" };
}

/** Prova usa somente ano; registros antigos com data viram ano na edição. */
export function normalizeScheduleForMaterial(
  schedule: PastExamScheduleValue,
  materialKind: "prova" | "exercicio",
): PastExamScheduleValue {
  if (materialKind !== "prova") {
    return schedule;
  }

  if (schedule.mode === "date" && schedule.exam_date.trim()) {
    const iso = displayToISO(schedule.exam_date.trim());
    return {
      mode: "year",
      exam_year: iso?.slice(0, 4) ?? "",
      exam_date: "",
    };
  }

  return {
    mode: "year",
    exam_year: schedule.exam_year,
    exam_date: "",
  };
}

export function validatePastExamSchedule(
  schedule: PastExamScheduleValue,
  materialKind: "prova" | "exercicio",
): { exam_date?: string; exam_year?: string } {
  const errors: { exam_date?: string; exam_year?: string } = {};

  if (materialKind === "prova") {
    const year = Number(schedule.exam_year);
    if (!schedule.exam_year.trim()) {
      errors.exam_year = "Selecione o ano da prova.";
    } else if (!Number.isFinite(year) || year < 1990 || year > 2100) {
      errors.exam_year = "Informe um ano entre 1990 e 2100.";
    }
    return errors;
  }

  // Exercício — opcional
  if (schedule.mode === "year" && schedule.exam_year.trim()) {
    const year = Number(schedule.exam_year);
    if (!Number.isFinite(year) || year < 1990 || year > 2100) {
      errors.exam_year = "Informe um ano entre 1990 e 2100.";
    }
  }

  if (schedule.mode === "date" && schedule.exam_date.trim()) {
    const iso = displayToISO(schedule.exam_date.trim());
    if (!iso) {
      errors.exam_date = "Informe a data no formato dd/mm/aaaa.";
    } else {
      const year = Number(iso.slice(0, 4));
      if (year < 1990 || year > 2100) {
        errors.exam_date = "A data deve ser de 1990 em diante.";
      }
    }
  }

  return errors;
}

export function scheduleToApiPayload(
  schedule: PastExamScheduleValue,
  materialKind?: "prova" | "exercicio",
): {
  exam_date: string | null;
  exam_year: number | null;
} {
  if (materialKind === "prova" && schedule.exam_year.trim()) {
    return {
      exam_date: null,
      exam_year: Number(schedule.exam_year),
    };
  }

  if (schedule.mode === "year" && schedule.exam_year.trim()) {
    return {
      exam_date: null,
      exam_year: Number(schedule.exam_year),
    };
  }

  if (schedule.mode === "date" && schedule.exam_date.trim()) {
    const iso = displayToISO(schedule.exam_date.trim());
    return {
      exam_date: iso || null,
      exam_year: null,
    };
  }

  return { exam_date: null, exam_year: null };
}

export function appendScheduleToFormData(
  formData: FormData,
  schedule: PastExamScheduleValue,
  materialKind?: "prova" | "exercicio",
): void {
  const { exam_date, exam_year } = scheduleToApiPayload(schedule, materialKind);
  if (exam_date) {
    formData.append("exam_date", exam_date);
  }
  if (exam_year != null) {
    formData.append("exam_year", String(exam_year));
  }
}
