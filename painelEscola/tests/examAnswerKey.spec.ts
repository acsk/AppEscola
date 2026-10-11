import { expect, test } from "@playwright/test";
import { conferenceExamAnswerKey } from "../utils/examAnswerKey";

const option = (order: number, correct = false) => ({ order, is_correct: correct });

test("a conferência separa Português e Matemática e aponta a letra divergente", () => {
  const questions = [
    { id: 1, type: "multiple_choice" as const, order: 1, subjectName: "Português", options: [option(1), option(2, true), option(3), option(4)] },
    { id: 2, type: "multiple_choice" as const, order: 2, subjectName: "Português", options: [option(1, true), option(2), option(3), option(4)] },
    { id: 3, type: "multiple_choice" as const, order: 3, subjectName: "Matemática", options: [option(1), option(2), option(3, true), option(4)] },
    { id: 4, type: "essay" as const, order: 4, subjectName: "Matemática", options: [] },
  ];
  const rows = conferenceExamAnswerKey(questions, "Português\n1.B\n2.D\nMatemática\n1.C");
  expect(rows.map((row) => row.status)).toEqual(["ok", "diff", "ok", "skip"]);
  expect(rows[1]).toMatchObject({ number: "2", current: "A", imported: "D", optionIndex: 3 });
  expect(rows[2]).toMatchObject({ number: "1", subjectName: "Matemática", current: "C", imported: "C" });
});
