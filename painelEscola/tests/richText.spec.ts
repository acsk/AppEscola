import { expect, test } from "@playwright/test";
import { domToRichText, normalizeRichText, parseRichText, plainRichText, richTextToHtml } from "../utils/richText";

/** Lógica pura (sem navegador): npx playwright test tests/richText.spec.ts --project=chromium */

test.describe("texto com formatação de questão", () => {
  test("divide em trechos com a formatação ativa", () => {
    expect(parseRichText("a <b>b <i>c</i></b> <u>d</u>")).toEqual([
      { text: "a ", b: false, i: false, u: false },
      { text: "b ", b: true, i: false, u: false },
      { text: "c", b: true, i: true, u: false },
      { text: " ", b: false, i: false, u: false },
      { text: "d", b: false, i: false, u: true },
    ]);
  });

  test("'<' que não é tag permitida continua texto; fechamento sem par é ignorado", () => {
    expect(plainRichText("x < 3 e <b>y</b> > 2</i>")).toBe("x < 3 e y > 2");
    expect(parseRichText("x < 3</b>")).toEqual([{ text: "x < 3", b: false, i: false, u: false }]);
  });

  test("HTML do editor escapa o texto e converte quebras", () => {
    expect(richTextToHtml("x < 3 & <b>y</b>\nz")).toBe("x &lt; 3 &amp; <b>y</b><br>z");
  });

  test("normaliza tags vazias, adjacentes e quebra final", () => {
    expect(normalizeRichText("<b>a</b><b>b</b><i></i>\n")).toBe("<b>ab</b>");
  });
});

/** Árvore simples do DOM (para rodar domToRichText no Node com o HTML real do Chromium). */
async function domTree(page: import("@playwright/test").Page, selector: string) {
  return page.$eval(selector, (root) => {
    const toTree = (node: Node): unknown => {
      const el = node as HTMLElement;
      return {
        nodeType: node.nodeType,
        nodeName: node.nodeName,
        textContent: node.nodeType === 3 ? node.textContent : null,
        style: el.style
          ? { fontWeight: el.style.fontWeight, fontStyle: el.style.fontStyle, textDecoration: el.style.textDecoration, textDecorationLine: el.style.textDecorationLine }
          : undefined,
        childNodes: Array.from(node.childNodes).map(toTree),
      };
    };
    return toTree(root);
  });
}

test.describe("editor (contentEditable no Chromium)", () => {
  test("negrito via execCommand, Enter como <br> e ida e volta do valor", async ({ page }) => {
    await page.setContent(`<div id="ed" contenteditable="true">${richTextToHtml("Se x < 3, calcule <i>y</i>")}</div>`);
    await page.evaluate(() => {
      const ed = document.getElementById("ed")!;
      const text = ed.firstChild!; // "Se x < 3, calcule "
      const range = document.createRange();
      range.setStart(text, 10);
      range.setEnd(text, 17);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("styleWithCSS", false, "false");
      document.execCommand("bold");
      range.selectNodeContents(ed);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertLineBreak");
      document.execCommand("insertText", false, "fim");
    });
    const value = domToRichText((await domTree(page, "#ed")) as never);
    // Digitar no fim de um trecho em itálico continua em itálico (comportamento normal de editor).
    expect(value).toBe("Se x < 3, <b>calcule</b> <i>y\nfim</i>");
    expect(richTextToHtml(value)).toBe("Se x &lt; 3, <b>calcule</b> <i>y<br>fim</i>");
  });

  test("HTML colado (Google Docs/Word): mantém só negrito/itálico/sublinhado e blocos viram linhas", async ({ page }) => {
    await page.setContent(
      `<div id="paste"><p><span style="font-weight:700">Texto</span> com <span style="font-style:italic">estilo</span></p>` +
        `<p><span style="text-decoration:underline">linha 2</span> <a href="x">link</a><img src="x"></p></div>`
    );
    expect(domToRichText((await domTree(page, "#paste")) as never)).toBe("<b>Texto</b> com <i>estilo</i>\n<u>linha 2</u> link");
  });
});
