import { matchAnswerKey, parseAnswerKey } from "./pdfQuestionImport";

export type ExamKeyQuestion = {
  id: number;
  type: "multiple_choice" | "essay";
  order: number;
  subjectName: string | null;
  options: { is_correct: boolean; order: number }[];
};

export type AnswerKeyConference = {
  questionId: number;
  order: number;
  subjectName: string | null;
  /** Número dentro da matéria (Português 1–20, Matemática 1–20). */
  number: string;
  current: string | null;
  imported: string | null;
  status: "ok" | "diff" | "missing" | "skip";
  optionIndex: number;
};

const letterOf = (index: number) => (index >= 0 && index < 26 ? String.fromCharCode(65 + index) : null);

/** Compara o gabarito colado com a alternativa marcada em cada questão do simulado. */
export function conferenceExamAnswerKey(questions: ExamKeyQuestion[], text: string): AnswerKeyConference[] {
  const sections = parseAnswerKey(text);
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  const tally = new Map<string, number>();
  const rows = sorted.map((question) => {
    const subjectKey = question.subjectName ?? "";
    const number = (tally.get(subjectKey) ?? 0) + 1;
    tally.set(subjectKey, number);
    const options = [...question.options].sort((a, b) => a.order - b.order);
    return { question, number: String(number), options };
  });
  const marks = matchAnswerKey(rows.map((row) => ({
    sourceNumber: row.number,
    type: row.question.type,
    subjectName: row.question.subjectName,
    optionCount: row.options.length,
  })), sections);

  return rows.map((row, index) => {
    const importedIndex = marks[index] ?? -1;
    const currentIndex = row.options.findIndex((option) => option.is_correct);
    const base = {
      questionId: row.question.id,
      order: row.question.order,
      subjectName: row.question.subjectName,
      number: row.number,
    };
    if (row.question.type === "essay" || row.options.length < 2) {
      return { ...base, current: null, imported: null, status: "skip" as const, optionIndex: -1 };
    }
    const imported = letterOf(importedIndex);
    const current = letterOf(currentIndex);
    const status = importedIndex < 0 ? "missing" as const : importedIndex === currentIndex ? "ok" as const : "diff" as const;
    return { ...base, current, imported, status, optionIndex: importedIndex };
  });
}
