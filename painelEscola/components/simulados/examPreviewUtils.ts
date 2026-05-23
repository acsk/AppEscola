import type { ExamPreviewPlayerQuestion } from "../../types/simulados";
import type { ExamPreviewQuestion, ExamQuestion } from "../../types/simulados";

export function mapExamQuestionToPreview(
  q: ExamQuestion,
  index: number
): ExamPreviewPlayerQuestion {
  return {
    id: q.id,
    type: q.type,
    question_text: q.question_text ?? "",
    image_url: q.image_url,
    video_url: q.video_url,
    points: Number(q.points) || 0,
    order: q.order ?? index + 1,
    explanation: q.explanation,
    options: (q.options ?? []).map((o, oi) => ({
      id: o.id ?? q.id * 1000 + (o.order ?? oi + 1),
      option_text: o.option_text,
      order: o.order ?? oi + 1,
      triggers_text_input: !!o.triggers_text_input,
      is_correct: o.is_correct,
    })),
  };
}

export function mapApiPreviewQuestion(
  q: ExamPreviewQuestion & {
    explanation?: string | null;
    options?: Array<{
      id: number;
      option_text: string;
      order: number;
      triggers_text_input: boolean;
      is_correct?: boolean;
    }>;
  }
): ExamPreviewPlayerQuestion {
  return {
    id: q.id,
    type: q.type,
    question_text: q.question_text,
    image_url: q.image_url,
    video_url: q.video_url,
    points: q.points,
    order: q.order,
    explanation: q.explanation ?? null,
    options: (q.options ?? []).map((o) => ({
      id: o.id,
      option_text: o.option_text,
      order: o.order,
      triggers_text_input: o.triggers_text_input,
      is_correct: o.is_correct,
    })),
  };
}

export function hasAnswerKey(questions: ExamPreviewPlayerQuestion[]): boolean {
  return questions.some(
    (q) =>
      q.type === "multiple_choice" &&
      q.options.some((o) => o.is_correct === true)
  );
}
