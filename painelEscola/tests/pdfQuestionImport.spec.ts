import { expect, test } from "@playwright/test";
import {
  chunkBlocks, joinStackedFractions, mergeWithNext, pageBlocks, pdfDocumentText, prepareQuestionBlocks, questionFingerprint,
  type PdfTextItem,
} from "../utils/pdfQuestionImport";

const item = (str: string, x: number, y: number, extra: Partial<PdfTextItem> = {}): PdfTextItem =>
  ({ str, x, y, width: str.length * 5, height: 10, hasEOL: false, ...extra });
const pageText = (items: PdfTextItem[]) => joinStackedFractions(items).map((i) => i.str + (i.hasEOL ? "\n" : " ")).join("");

test("frações empilhadas viram a/b, com o numerador de cima mesmo quando vem depois no arquivo", () => {
  // "Calcule 1/100 de 3/5." — numerador 6 acima e denominador 6 abaixo da linha da frase (y = 100).
  const inSentence = [
    item("Calcule", 0, 100), item("1", 52, 106, { hasEOL: true }), item("100", 45, 94), item("de", 70, 100),
    item("5", 92, 94, { hasEOL: true }), item("3", 92, 106), item(".", 100, 100),
  ];
  expect(pageText(inSentence)).toBe("Calcule 1/100 de 3/5 . ");

  // Alternativa "a) 3/5" com o traço da fração extraído como texto.
  expect(pageText([item("a)", 0, 100), item("3", 20, 106, { hasEOL: true }), item("—", 19, 100), item("5", 20, 94)])).toBe("a) 3/5 ");
});

test("números de uma coluna de tabela e expoentes não viram fração", () => {
  const table = [item("Ano", 0, 120, { hasEOL: true }), item("10", 0, 108, { hasEOL: true }), item("20", 0, 96, { hasEOL: true })];
  expect(pageText(table)).toBe("Ano\n10\n20\n");
  expect(pageText([item("x", 0, 100), item("2", 6, 104, { height: 7 }), item("+ 1", 14, 100)])).toBe("x 2 + 1 ");
});

test("texto integral preserva páginas, numeração e gabarito para a IA separar", () => {
  const pages = ["Cabeçalho\n7. Observe a figura.\nA) seis\nB) oito", "continuação da questão\nGABARITO 7-A", ""];
  const text = pdfDocumentText(pages);
  expect(text).toContain("[PÁGINA 1]\n" + pages[0]);
  expect(text).toContain("[PÁGINA 2]\n" + pages[1]);
  expect(text).toContain("[PÁGINA 3]\n[SEM TEXTO EXTRAÍVEL]");
});

test("PDF sem texto e texto acima do limite falham explicitamente sem truncar", () => {
  expect(() => pdfDocumentText(["", " "])).toThrow("aplique OCR");
  expect(() => pdfDocumentText(["a".repeat(120000)])).toThrow("ultrapassa");
});

/** Lógica pura (sem navegador): npx playwright test tests/pdfQuestionImport.spec.ts --project=chromium */

const header = "Simulado ENEM 2024 — Cursinho Exemplo";

test.describe("preparação de questões de PDF", () => {
  test("remove cabeçalho/rodapé repetidos, divide por numeração sequencial e lê o gabarito", () => {
    const pages = [
      `${header}\nINSTRUÇÕES: leia com atenção.\n1. Quanto é 2 + 2?\na) 3\nb) 4\nPágina 1`,
      `${header}\n2) Considere as afirmações:\n1. A água ferve a 100 °C.\n2. O gelo flutua.\nQual está correta?\na) só 1\nb) ambas\nPágina 2`,
      `${header}\nQuestão 3\nObserve o gráfico abaixo e responda.\na) sobe\nb) desce\nPágina 3`,
      `${header}\nGABARITO\n1-B 2-B 3-A\nPágina 4`,
    ];

    const prepared = prepareQuestionBlocks(pages);

    expect(prepared.blocks.map((b) => b.number)).toEqual([1, 2, 3]);
    expect(prepared.blocks[0].text).toBe("1. Quanto é 2 + 2?\na) 3\nb) 4");
    // A lista "1." / "2." dentro da questão 2 não vira questão nova.
    expect(prepared.blocks[1].text).toContain("1. A água ferve a 100 °C.");
    expect(prepared.answerKey).toEqual({ 1: "B", 2: "B", 3: "A" });
    expect(prepared.blocks.map((b) => b.answerHint)).toEqual(["B", "B", "A"]);
    expect(prepared.blocks[2].mentionsImage).toBe(true);
    expect(prepared.blocks.some((b) => b.text.includes(header))).toBe(false);
    expect(prepared.preambleChars).toBeGreaterThan(0);
  });

  test("desfaz hifenização e cai para um bloco por página sem numeração", () => {
    const prepared = prepareQuestionBlocks(["A fotossín-\ntese ocorre nas folhas.", "Explique a respiração celular."]);
    expect(prepared.blocks).toHaveLength(2);
    expect(prepared.blocks[0].text).toBe("A fotossíntese ocorre nas folhas.");
    expect(prepared.blocks[0].number).toBeNull();
  });

  test("juntar blocos e lotes de 5", () => {
    const { blocks } = prepareQuestionBlocks(["1. Primeira parte do enunciado\n2. continuação errada\n3. Outra questão aqui"]);
    const merged = mergeWithNext(blocks, blocks[0].key);
    expect(merged).toHaveLength(2);
    expect(merged[0].text).toContain("continuação errada");
    expect(chunkBlocks([1, 2, 3, 4, 5, 6, 7]).map((c) => c.length)).toEqual([5, 2]);
  });
});

test("blocos de 2 páginas e questões repetidas entre blocos", () => {
  expect(pageBlocks(10)).toEqual([{ from: 1, to: 2 }, { from: 3, to: 4 }, { from: 5, to: 6 }, { from: 7, to: 8 }, { from: 9, to: 10 }]);
  expect(pageBlocks(3)).toEqual([{ from: 1, to: 2 }, { from: 3, to: 3 }]);
  const a = { question_text: "<b>Texto</b>\nDe acordo com o texto, estamos", options: [{ option_text: "hidratados." }] };
  const b = { question_text: "Texto\nDe acordo com o  texto,\nestamos", options: [{ option_text: "Hidratados." }] };
  expect(questionFingerprint(a)).toBe(questionFingerprint(b));
  // Um bloco anexou o texto de apoio e o outro não: ainda é a mesma questão.
  expect(questionFingerprint({ ...b, question_text: "Texto longo de apoio.\n\nDe acordo com o texto, estamos" }))
    .toBe(questionFingerprint({ ...b, question_text: "De acordo com o texto, estamos" }));
  expect(questionFingerprint(a)).not.toBe(questionFingerprint({ ...b, options: [{ option_text: "infectados" }] }));
});
