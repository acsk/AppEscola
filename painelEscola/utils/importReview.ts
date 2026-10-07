import { validateContent, type ContentForm } from "./questionContent";
import type { ClassificationForm } from "./questionClassification";
import { plainRichText } from "./richText";

/** Questão em revisão na importação de PDF (o mínimo que as regras abaixo leem). */
export type ReviewDraft = {
  content: ContentForm;
  classification: ClassificationForm;
  needsImage: boolean;
  imageLoadError?: boolean;
  answerFromPdf: boolean;
  reviewed?: boolean;
};

export type IssueCode = "enunciado" | "alternativas" | "gabarito" | "imagem" | "imagem_erro" | "disciplina" | "assunto";

export const ISSUE_LABEL: Record<IssueCode, string> = {
  enunciado: "Enunciado vazio",
  alternativas: "Alternativas incompletas",
  gabarito: "Sem gabarito",
  imagem: "Falta imagem",
  imagem_erro: "Imagem com erro",
  disciplina: "Sem disciplina",
  assunto: "Sem assunto",
};

/**
 * Pendências que impedem confirmar/incluir a questão. "Sem assunto" só conta quando a disciplina
 * tem assuntos cadastrados (`subjectHasTopics`).
 */
export function reviewIssues(draft: ReviewDraft, subjectHasTopics: (subjectId: number) => boolean = () => false): IssueCode[] {
  const issues: IssueCode[] = [];
  const content = validateContent(draft.content);
  if (content.question_text) issues.push("enunciado");
  if (content.options) issues.push(content.options.includes("correta") ? "gabarito" : "alternativas");
  if (draft.needsImage && !draft.content.image_url) issues.push("imagem");
  else if (draft.imageLoadError) issues.push("imagem_erro");
  const subjectId = draft.classification.subject_id;
  if (!subjectId) issues.push("disciplina");
  else if (!draft.classification.topic_ids.length && subjectHasTopics(subjectId)) issues.push("assunto");
  return issues;
}

/** ok = revisada; warn = com pendências; check = sem pendências, falta conferir. */
export type ReviewStatus = "ok" | "warn" | "check";

export function reviewStatus(draft: ReviewDraft, issues: IssueCode[]): ReviewStatus {
  if (draft.reviewed && !issues.length) return "ok";
  return issues.length ? "warn" : "check";
}

/** Comando da questão: último parágrafo (o texto de apoio vem antes, separado por linha em branco). */
export function questionCommand(questionText: string): string {
  const paragraphs = plainRichText(questionText ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return paragraphs[paragraphs.length - 1] ?? "";
}

/** Resumo de uma linha para a lista de questões. */
export function questionSnippet(questionText: string, max = 60): string {
  const command = questionCommand(questionText).replace(/\s+/g, " ");
  if (!command) return "Sem enunciado";
  return command.length > max ? `${command.slice(0, max - 1).trimEnd()}…` : command;
}

/** Texto comparável entre PDF e enunciado: sem acentos de formatação, espaços nem pontuação. */
export function normalizeForMatch(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Página (1-based) do PDF onde está o comando da questão; null se não achar. */
export function findSourcePage(pages: string[], questionText: string): number | null {
  const needle = normalizeForMatch(questionCommand(questionText)).slice(0, 40);
  if (needle.length < 12) return null;
  const index = pages.findIndex((page) => normalizeForMatch(page).includes(needle));
  return index >= 0 ? index + 1 : null;
}

/**
 * Trechos de texto da página que pertencem à questão (para destacá-la no PDF): índices dos itens de
 * texto contidos no enunciado/alternativas, no maior trecho contínuo (na ordem de leitura).
 */
export function questionTextRun(items: string[], questionText: string, options: string[] = []): number[] {
  const haystack = normalizeForMatch([questionCommand(questionText), ...options].join(" "));
  if (haystack.length < 12) return [];
  const matched = items
    // Sem o número da questão ("3.") e a letra da alternativa ("a)"), que o enunciado não traz.
    .map((str, index) => ({ index, norm: normalizeForMatch(str.replace(/^\s*(\d{1,3}|[a-jA-J])\s*[.)\-–]\s*/, "")) }))
    .filter(({ norm }) => norm.length >= 8 && haystack.includes(norm))
    .map(({ index }) => index);
  // Maior sequência de itens próximos (até 4 itens não reconhecidos entre eles, ex.: letras "a)").
  let best: number[] = [];
  let current: number[] = [];
  for (const index of matched) {
    if (current.length && index - current[current.length - 1] > 5) current = [];
    current.push(index);
    if (current.length > best.length) best = [...current];
  }
  return best.length >= 2 ? best : [];
}
