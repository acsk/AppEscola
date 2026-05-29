import type { ExamQuestion } from "../types/simulados";

/** Alinhado à API: enunciado (texto ou imagem), pontuação e alternativas válidas. */
export function isExamQuestionComplete(question: ExamQuestion): boolean {
  const hasEnunciado =
    Boolean((question.question_text ?? "").trim()) ||
    Boolean((question.image_url ?? "").trim());

  if (!hasEnunciado || !(question.points > 0)) {
    return false;
  }

  if (question.type === "essay") {
    return true;
  }

  if (question.type !== "multiple_choice") {
    return false;
  }

  const filledOptions = question.options.filter((option) => option.option_text.trim() !== "");

  if (filledOptions.length < 2) {
    return false;
  }

  return filledOptions.filter((option) => option.is_correct).length === 1;
}

export function countCompleteExamQuestions(questions: ExamQuestion[]): number {
  return questions.filter(isExamQuestionComplete).length;
}
