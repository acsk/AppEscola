import type { AiImageReview } from "../types/questionAi";
import type { ContentForm } from "./questionContent";
import { normalizeRichText, plainRichText } from "./richText";

export function imageQuestionContent(content: ContentForm) {
  return {
    type: content.type,
    question_text: normalizeRichText(content.question_text.trim()),
    explanation: normalizeRichText(content.explanation.trim()),
    options: content.type === "essay" ? [] : content.options
      .filter((option) => plainRichText(option.option_text).trim() !== "")
      .map((option) => ({
        option_text: normalizeRichText(option.option_text.trim()),
        is_correct: option.is_correct,
      })),
  };
}

export function imageContentSignature(content: ContentForm): string {
  const { explanation, ...essential } = imageQuestionContent(content);
  return JSON.stringify(essential);
}

export function imageReviewIssue(content: ContentForm, image?: AiImageReview, signature?: string): string | null {
  if (!image) return null;
  if (image.image_generation.status !== "READY" || !image.image_url) {
    return image.image_generation.reason || "A imagem não está pronta. Regenere antes de aprovar.";
  }
  if (imageContentSignature(content) !== signature || content.image_url !== image.image_url) {
    return "A questão foi alterada. Regenere a imagem para atualizar os dados e a validação.";
  }
  return null;
}
