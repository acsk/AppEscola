import { expect, test, type Page } from "@playwright/test";
import type { ImportDraft, ImportDraftPayload } from "../services/questionImportDrafts";

const baseUrl = process.env.PANEL_TEST_URL;
test.skip(!baseUrl, "Defina PANEL_TEST_URL com o servidor Expo web para validar a tela.");

const imageUrl = `${baseUrl}/mock-question.png`;
const generationId = "00000000-0000-4000-8000-000000000001";

function textPdf(text = "7. Observe a figura.\nA) seis\nB) oito\nGABARITO 7-A"): Buffer {
  const stream = "BT /F1 12 Tf 50 760 Td 16 TL\n" + text.split("\n")
    .map((line) => `(${line.replace(/[\\()]/g, "\\$&")}) Tj T*`).join("\n") + "\nET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function pdfWorker(page: Page) {
  await page.route("https://unpkg.com/pdfjs-dist@*/build/pdf.worker.min.mjs", (route) => route.fulfill({
    path: require.resolve("pdfjs-dist/build/pdf.worker.min.mjs", { paths: [require.resolve("react-pdf")] }),
    contentType: "text/javascript", headers: { "access-control-allow-origin": "*" },
  }));
}

async function startTwoQuestionImport(page: Page) {
  await pdfWorker(page);
  await page.route("**/api/question-bank/ai/separate-text*", (route) => route.fulfill({
    headers: { "access-control-allow-origin": new URL(baseUrl!).origin, "access-control-allow-credentials": "true" },
    json: { type: "success", message: "Questões separadas.", body: { questions: [
      { type: "multiple_choice", source_number: "1", question_text: "Quanto é dois mais dois?", explanation: "",
        needs_image: false, answer_from_pdf: false,
        options: [{ option_text: "Quatro", is_correct: false }, { option_text: "Cinco", is_correct: false }] },
      { type: "essay", source_number: "2", question_text: "Explique sua estratégia de cálculo.", explanation: "",
        needs_image: false, answer_from_pdf: false, options: [] },
    ] } },
  }));
  await page.goto(`${baseUrl}/#/questoes`);
  await page.getByRole("button", { name: "Importar PDF com IA", exact: true }).click();
  await page.getByRole("textbox", { name: "Nome da prova/simulado de origem" }).fill("Prova revisável");
  await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles({
    name: "prova.pdf", mimeType: "application/pdf", buffer: textPdf(),
  });
  await page.getByRole("button", { name: "Separar questões com IA", exact: true }).click();
  await expect(page.getByRole("tab", { name: "01", exact: true })).toBeVisible();
}
const generated = {
  type: "essay",
  question_text: "Triângulo com 6 cm, 8 cm e 10 cm.",
  explanation: "Resolva usando as medidas indicadas.",
  generation_id: generationId,
  image_url: imageUrl,
  image_generation: {
    status: "READY", model: "test/image", attempts: 1,
    validation: { valida: true, confidence: 0.94, problemas: [], recomendacao: null },
    reason: null,
  },
};
const sourceQuestion = {
  id: 123, origin: "avulsa", type: "essay", question_text: "Triângulo com 3 cm, 4 cm e 5 cm.",
  image_url: imageUrl, difficulty_id: null, explanation: null, options: [],
  subject_id: null, topic_ids: [], board_id: null, year: null, exam_type_id: null,
  is_annulled: false, is_outdated: false, tags: [], topics: [], complete: false,
};

async function setup(page: Page, available = true, statusCode = 200, questionOverrides: {
  type?: "multiple_choice" | "essay";
  image_url?: string;
  subject_id?: number | null;
  is_annulled?: boolean;
  source_exam_name?: string;
} = {}, paginatedSubjects = false, pdfCatalogs = false) {
  let saved = 0;
  let aiRequests = 0;
  let currentStatusCode = statusCode;
  const regenerations: unknown[] = [];
  const saves: Record<string, unknown>[] = [];
  const question = { ...sourceQuestion, ...questionOverrides };
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "ui-test-token");
    localStorage.setItem("auth_user", JSON.stringify({ id: 1, name: "Equipe de teste", role: "admin", tenant_id: 1 }));
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown = [];
    let status = 200;
    if (path === "/api/subjects") {
      await route.fulfill({
        headers: { "access-control-allow-origin": new URL(baseUrl!).origin, "access-control-allow-credentials": "true" },
        json: {
          data: paginatedSubjects
            ? Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, name: `Disciplina ${i + 1}` }))
            : [{ id: 10, name: "Matemática" }, { id: 11, name: "Português" }],
          meta: { current_page: 1, last_page: paginatedSubjects ? 2 : 1 },
        },
      });
      return;
    }
    if (path === "/api/question-bank/import-drafts") body = { items: [], current_page: 1, last_page: 1 };
    else if (path.endsWith("/ai/status")) {
      body = { available, provider: "openrouter", source: "tenant" };
      status = currentStatusCode;
    }
    else if (path.endsWith("/ai/autofill")) body = {
      type: "multiple_choice", question_text: "Quanto é a soma de dois e dois?", explanation: "Dois mais dois é quatro.",
      options: [{ option_text: "Quatro", is_correct: true }, { option_text: "Cinco", is_correct: false }],
      subject_id: 10, topic_ids: [20], difficulty_id: 30, board_id: 40, year: 2020, tags: ["soma"],
    };
    else if (path === "/api/question-bank/subjects") body = [
      ...(paginatedSubjects ? Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, name: `Disciplina ${i + 1}` })) : []),
      { id: 10, name: "Matemática" }, { id: 11, name: "Português" },
    ];
    else if (path.endsWith("/difficulties")) body = [{ id: 30, name: "Fácil" }];
    else if (pdfCatalogs && path.endsWith("/taxonomy")) body = [
      { id: 10, name: "Matemática", topics: [{ id: 20, subject_id: 10, name: paginatedSubjects ? "Equações" : "Aritmética" }] },
      { id: 11, name: "Português", topics: [] },
    ];
    else if (path.endsWith("/boards")) body = [{ id: 40, name: "ENEM" }];
    else if (path.endsWith("/topics")) body = [{ id: 20, subject_id: 10, name: paginatedSubjects ? "Equações" : "Aritmética" }];
    else if (path.endsWith("/questions/123")) {
      if (request.method() === "PUT") {
        saved++;
        saves.push(request.postDataJSON());
        body = { ...question, ...request.postDataJSON() };
      } else body = question;
    }
    else if (path.endsWith("/ai/similar")) body = { questions: [generated] };
    else if (path.endsWith("/regenerate")) {
      regenerations.push(request.postDataJSON());
      body = { generation_id: generationId, image_url: `${imageUrl}?revision=2`, image_generation: { ...generated.image_generation, attempts: 2 } };
    } else if (path.endsWith("/question-bank/questions") && request.method() === "GET") {
      await route.fulfill({
        headers: {
          "access-control-allow-origin": new URL(baseUrl!).origin,
          "access-control-allow-credentials": "true",
        },
        json: {
          data: [sourceQuestion],
          meta: {
            current_page: 1, last_page: 1, per_page: 20, total: 1,
            tab_counts: { all: 1, complete: 0, incomplete: 1, annulled: 0, outdated: 0 },
          },
        },
      });
      return;
    } else if (path.endsWith("/question-bank/questions") && request.method() === "POST") {
      saved++;
      saves.push(request.postDataJSON());
      status = 201;
      body = { id: 321 };
    }
    if (request.method() === "POST" && /\/ai\/(autofill|similar)$/.test(path)) aiRequests++;
    await route.fulfill({
      status,
      headers: {
        "access-control-allow-origin": new URL(baseUrl!).origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "Authorization, Content-Type",
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      },
      json: status >= 400
        ? { message: "Server Error" }
        : { type: "success", message: "Campos sugeridos pela IA. Revise antes de salvar.", body },
    });
  });
  await page.route("**/mock-question.png*", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
  }));

  return { saved: () => saved, saves, aiRequests: () => aiRequests, recoverStatus: () => { currentStatusCode = 200; }, regenerations };
}

test("PDF envia somente texto para IA separar, marca imagem e salva origem após anexo manual", async ({ page }) => {
  const state = await setup(page, true, 200, {}, false, true);
  await pdfWorker(page);
  let sent: { text: string; source_exam_name: string } | undefined;
  let uploads = 0;
  await page.route("**/api/question-bank/questions/upload-image*", async (route) => {
    uploads++;
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    await route.fulfill({
      headers: { "access-control-allow-origin": new URL(baseUrl!).origin, "access-control-allow-credentials": "true" },
      json: { type: "success", message: "Imagem enviada.", body: { image_url: imageUrl } },
    });
  });
  await page.route("**/api/question-bank/ai/separate-text*", async (route) => {
    sent = route.request().postDataJSON();
    expect(route.request().headers()["content-type"]).toContain("application/json");
    await route.fulfill({
      headers: { "access-control-allow-origin": new URL(baseUrl!).origin, "access-control-allow-credentials": "true" },
      json: {
        type: "success", message: "Questões separadas pela IA.",
        body: { questions: [{
          question_text: "Observe a figura e informe a medida.", explanation: "Gabarito do documento.",
          source_number: "7", answer_from_pdf: true, needs_image: true,
          subject_id: 10, topic_ids: [20],
          type: "multiple_choice", options: [
            { option_text: "6 cm", is_correct: true }, { option_text: "8 cm", is_correct: false },
          ],
        }] },
      },
    });
  });
  await page.goto(`${baseUrl}/#/questoes`);
  await page.getByRole("button", { name: "Importar PDF com IA", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Nome da prova/simulado de origem" });
  await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles({
    name: "prova.pdf", mimeType: "application/pdf", buffer: textPdf(),
  });
  await expect(page.getByRole("button", { name: "Separar questões com IA", exact: true })).toBeDisabled();
  await name.fill("Simulado outubro 2026");
  await page.getByRole("button", { name: "Separar questões com IA", exact: true }).click();
  await expect(page.getByText("Revisar questões convertidas pela IA", { exact: true })).toBeVisible();
  await expect(page.getByText("Imagem pendente — anexar manualmente", { exact: true })).toBeVisible();
  expect(sent?.text).toContain("[PÁGINA 1]");
  expect(sent?.text).toContain("7. Observe a figura.");
  expect(sent?.text).toContain("GABARITO 7-A");
  expect(sent?.text).not.toContain("data:application/pdf");
  expect(sent?.source_exam_name).toBe("Simulado outubro 2026");
  expect(state.regenerations).toHaveLength(0);
  expect(state.saved()).toBe(0);
  await expect(page.getByRole("textbox", { name: "Texto da alternativa A" })).toHaveText("6 cm");
  await expect(page.getByRole("radio", { name: "Alternativa A é a correta" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Matemática", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Enunciado", exact: true }).fill("Triângulo editado com 12 cm.");
  await page.getByRole("button", { name: "Incluir 1 questões", exact: true }).click();
  await expect(page.getByText("Corrija as questões e anexe as imagens destacadas antes de incluir.", { exact: true }).first()).toBeVisible();
  expect(state.saved()).toBe(0);
  await page.getByRole("button", { name: "Anexar imagem manualmente", exact: true }).click();
  await page.locator('input[aria-label="Arquivo de imagem da questão"]').setInputFiles({
    name: "figura.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByText("Imagem anexada manualmente", { exact: true })).toBeVisible();
  expect(uploads).toBe(1);
  expect(state.regenerations).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Incluir 1 questões", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Incluir 1 questões", exact: true }).click();
  await expect.poll(state.saved).toBe(1);
  expect(state.saves[0]).toMatchObject({
    image_url: imageUrl, subject_id: 10, topic_ids: [20], source_exam_name: "Simulado outubro 2026", needs_image: true,
    question_text: "Triângulo editado com 12 cm.",
  });
  expect(state.saves[0]).not.toHaveProperty("generation_id");
});

test("PDF incompleto mostra erro sem criar questões ou chamar geração", async ({ page }) => {
  const state = await setup(page);
  await pdfWorker(page);
  await page.route("**/api/question-bank/ai/separate-text*", (route) => route.fulfill({
    status: 422, headers: { "access-control-allow-origin": new URL(baseUrl!).origin, "access-control-allow-credentials": "true" },
    json: { type: "error", message: "A IA não converteu o PDF completo.", body: { code: "pdf_incomplete" } },
  }));
  await page.goto(`${baseUrl}/#/questoes`);
  await page.getByRole("button", { name: "Importar PDF com IA", exact: true }).click();
  await page.getByRole("textbox", { name: "Nome da prova/simulado de origem" }).fill("Prova de teste");
  await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles({
    name: "prova.pdf", mimeType: "application/pdf", buffer: textPdf(),
  });
  await page.getByRole("button", { name: "Separar questões com IA", exact: true }).click();
  await expect(page.getByText("A IA não converteu o PDF completo.", { exact: true })).toBeVisible();
  expect(state.saved()).toBe(0);
  expect(state.regenerations).toHaveLength(0);
});

test("importação PDF se adapta ao mobile em tema escuro", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("ds_theme", "dark"));
  await page.goto(`${baseUrl}/#/questoes`);
  await page.getByRole("button", { name: "Importar PDF com IA", exact: true }).click();
  await expect(page.getByRole("button", { name: "Separar questões com IA", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("PDF sem texto pede OCR e não chama a IA", async ({ page }) => {
  const state = await setup(page);
  await pdfWorker(page);
  let calls = 0;
  await page.route("**/api/question-bank/ai/separate-text*", () => { calls++; });
  await page.goto(`${baseUrl}/#/questoes`);
  await page.getByRole("button", { name: "Importar PDF com IA", exact: true }).click();
  await page.getByRole("textbox", { name: "Nome da prova/simulado de origem" }).fill("Prova escaneada");
  await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles({
    name: "scan.pdf", mimeType: "application/pdf", buffer: textPdf(""),
  });
  await page.getByRole("button", { name: "Separar questões com IA", exact: true }).click();
  await expect(page.getByText("O PDF não possui texto extraível.", { exact: false })).toBeVisible();
  expect(calls).toBe(0);
  expect(state.saved()).toBe(0);
});

test("PDF permite corrigir marcação de imagem e exige revisão do gabarito desconhecido", async ({ page }) => {
  const state = await setup(page);
  await pdfWorker(page);
  await page.route("**/api/question-bank/ai/separate-text*", (route) => route.fulfill({
    headers: { "access-control-allow-origin": new URL(baseUrl!).origin, "access-control-allow-credentials": "true" },
    json: { type: "success", message: "Questão separada.", body: { questions: [{
      type: "multiple_choice", source_number: "7", question_text: "Quanto é dois mais dois?", explanation: "Revisar gabarito.",
      needs_image: true, answer_from_pdf: false,
      options: [{ option_text: "Quatro", is_correct: false }, { option_text: "Cinco", is_correct: false }],
    }] } },
  }));
  await page.goto(`${baseUrl}/#/questoes`);
  await page.getByRole("button", { name: "Importar PDF com IA", exact: true }).click();
  await page.getByRole("textbox", { name: "Nome da prova/simulado de origem" }).fill("Prova sem figuras");
  await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles({
    name: "prova.pdf", mimeType: "application/pdf", buffer: textPdf("7. Quanto e dois mais dois?\nA) Quatro\nB) Cinco"),
  });
  await page.getByRole("button", { name: "Separar questões com IA", exact: true }).click();
  await expect(page.getByText("Gabarito pendente — revisar", { exact: true })).toBeVisible();
  await page.getByRole("switch", { name: "Questão 7 precisa de imagem", exact: true }).click();
  await expect(page.getByText("Imagem pendente — anexar manualmente", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Incluir 1 questões", exact: true }).click();
  await expect(page.getByText("Marque exatamente uma alternativa como correta.", { exact: true })).toBeVisible();
  expect(state.saved()).toBe(0);
  await page.getByRole("radio", { name: "Alternativa A é a correta" }).click();
  await page.getByRole("button", { name: "Incluir 1 questões", exact: true }).click();
  await expect.poll(state.saved).toBe(1);
  expect(state.saves[0]).toMatchObject({ needs_image: false, image_url: null, source_exam_name: "Prova sem figuras" });
});

test("PDF usa abas e autocompleta somente a questão individual sem salvar", async ({ page }) => {
  const state = await setup(page, true, 200, {}, false, true);
  await startTwoQuestionImport(page);
  await expect(page.getByRole("textbox", { name: "Enunciado", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Autocompletar questão com IA", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Explicação", exact: true })).toHaveText("Dois mais dois é quatro.");
  await expect(page.getByRole("radio", { name: "Alternativa A é a correta" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("combobox", { name: "Disciplina", exact: true }).last()).toContainText("Matemática");
  expect(state.aiRequests()).toBe(1);
  expect(state.saved()).toBe(0);
  await page.getByRole("tab", { name: "02", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Enunciado", exact: true })).toHaveText("Explique sua estratégia de cálculo.");
  await expect(page.getByRole("textbox", { name: "Explicação", exact: true })).toBeEmpty();
  await page.getByRole("textbox", { name: "Enunciado", exact: true }).fill("Explique sua estratégia revisada.");
  await page.getByRole("tab", { name: "01", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Explicação", exact: true })).toHaveText("Dois mais dois é quatro.");
  await page.getByRole("tab", { name: "02", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Enunciado", exact: true })).toHaveText("Explique sua estratégia revisada.");
});

test("PDF aceita imagem colada e a mantém ao trocar de aba", async ({ page }) => {
  await setup(page);
  let uploads = 0;
  await page.route("**/api/question-bank/questions/upload-image*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ headers: {
        "access-control-allow-origin": new URL(baseUrl!).origin, "access-control-allow-credentials": "true",
        "access-control-allow-headers": "Authorization, Content-Type", "access-control-allow-methods": "POST, OPTIONS",
      } });
      return;
    }
    uploads++;
    await route.fulfill({
      headers: { "access-control-allow-origin": new URL(baseUrl!).origin, "access-control-allow-credentials": "true" },
      json: { type: "success", message: "Imagem colada salva.", body: { image_url: imageUrl } },
    });
  });
  await startTwoQuestionImport(page);
  const pasteTarget = page.getByRole("textbox", { name: "Colar imagem da questão 1" });
  await pasteTarget.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.items.add("texto, não uma imagem", "text/plain");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true }));
  });
  await expect(page.getByText("Copie uma imagem e cole aqui; textos e links não são imagens.", { exact: true })).toBeVisible();
  expect(uploads).toBe(0);
  await pasteTarget.evaluate((element) => {
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="), (char) => char.charCodeAt(0));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([bytes], "colada.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText("Imagem anexada manualmente", { exact: true })).toBeVisible();
  expect(uploads).toBe(1);
  await page.getByRole("tab", { name: "02", exact: true }).click();
  await expect(page.getByText("Imagem anexada manualmente", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "01", exact: true }).click();
  await expect(page.getByText("Imagem anexada manualmente", { exact: true })).toBeVisible();
});

test("PDF salva rascunho incompleto no servidor, retoma e retira apenas a questão incluída", async ({ page }) => {
  const state = await setup(page);
  const id = "00000000-0000-4000-8000-000000000002";
  let stored: ImportDraft | null = null;
  let saves = 0;
  let inclusions = 0;
  await page.route("**/api/question-bank/import-drafts**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: {
        "access-control-allow-origin": new URL(baseUrl!).origin, "access-control-allow-credentials": "true",
        "access-control-allow-headers": "Authorization, Content-Type", "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
      } });
      return;
    }
    const path = new URL(request.url()).pathname;
    let body: unknown;
    if (path.endsWith("/include")) {
      inclusions++;
      const payload = request.postDataJSON();
      expect(payload.revision).toBe(stored?.revision);
      stored = { ...stored!, revision: stored!.revision + 1,
        questions: stored!.questions.filter((question) => question.key !== "pdf-1"),
        active_question_key: "pdf-0" };
      body = { draft: stored };
    } else if (request.method() === "POST" || request.method() === "PUT") {
      const payload: ImportDraftPayload & { revision?: number } = request.postDataJSON();
      if (request.method() === "PUT") expect(payload.revision).toBe(stored?.revision);
      saves++;
      stored = { ...payload, id, revision: saves, updated_at: "2026-10-07T03:00:00Z" };
      body = stored;
    } else if (path.endsWith(id)) body = stored;
    else body = { items: stored ? [{ id, source_exam_name: stored.source_exam_name, question_count: stored.questions.length,
      updated_at: stored.updated_at }] : [], current_page: 1, last_page: 1 };
    await route.fulfill({
      headers: { "access-control-allow-origin": new URL(baseUrl!).origin, "access-control-allow-credentials": "true" },
      json: { type: "success", message: "Rascunho salvo no servidor.", body },
    });
  });
  await startTwoQuestionImport(page);
  await page.getByRole("button", { name: "Desmarcar questão 1" }).click();
  await page.getByRole("tab", { name: "02", exact: true }).click();
  await page.getByRole("textbox", { name: "Enunciado", exact: true }).fill("Explique a estratégia que você utilizou.");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect.poll(() => saves).toBe(1);
  expect(stored!.questions[0].content.options.every((option) => !option.is_correct)).toBe(true);
  expect(stored!.active_question_key).toBe("pdf-1");
  expect(state.saved()).toBe(0);
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Importar PDF com IA", exact: true }).click();
  await page.getByRole("button", { name: "Retomar Prova revisável (2 questões)", exact: true }).click();
  await expect(page.getByRole("tab", { name: "02", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "Enunciado", exact: true })).toHaveText("Explique a estratégia que você utilizou.");
  await page.getByRole("button", { name: "Incluir 1 questões", exact: true }).click();
  await expect.poll(() => inclusions).toBe(1);
  await expect(page.getByRole("dialog", { name: "Revisar questões convertidas pela IA" })).toHaveCount(0);
  await page.getByRole("button", { name: "Importar PDF com IA", exact: true }).click();
  await page.getByRole("button", { name: "Retomar Prova revisável (1 questões)", exact: true }).click();
  await expect(page.getByRole("tab", { name: "01", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "02", exact: true })).toHaveCount(0);
  expect(stored!.questions[0].key).toBe("pdf-0");
  expect(state.saved()).toBe(0);
});

test("PDF revisão em abas permanece responsiva no mobile e tablet e confirma alterações ao fechar", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("ds_theme", "dark"));
  await page.setViewportSize({ width: 390, height: 844 });
  await startTwoQuestionImport(page);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("tab", { name: "01", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Salvar rascunho", exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.getByText("Fechar sem salvar as alterações?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continuar revisão", exact: true }).click();
  await expect(page.getByRole("tab", { name: "02", exact: true })).toBeVisible();
});

test("nome da prova de origem carrega na edição e é salvo sem vincular simulado", async ({ page }) => {
  const state = await setup(page, true, 200, { source_exam_name: "Simulado outubro 2026" });
  await page.goto(`${baseUrl}/#/questoes/123/editar`);
  const input = page.getByRole("textbox", { name: "Nome da prova/simulado de origem" });
  await expect(input).toHaveValue("Simulado outubro 2026");
  await input.fill("Prova revisada");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect.poll(state.saved).toBe(1);
  expect(state.saves[0]).toMatchObject({ source_exam_name: "Prova revisada" });
  expect(state.saves[0]).not.toHaveProperty("exam_id");
});

test("Nova questão mostra autocompletar, preenche e aguarda revisão sem salvar", async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${baseUrl}/#/questoes/nova`);
  const button = page.getByRole("button", { name: "Autocompletar com IA", exact: true }).first();
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(page.getByText("Escreva ao menos 15 caracteres", { exact: false })).toBeVisible();
  await button.click();
  await expect(page.getByText("Escreva um enunciado com pelo menos 15 caracteres para usar a IA.", { exact: true }).first()).toBeVisible();
  expect(state.aiRequests()).toBe(0);
  await page.getByRole("textbox", { name: "Enunciado", exact: true }).fill("Quanto é a soma de dois e dois?");
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole("textbox", { name: "Texto da alternativa A" })).toHaveText("Quatro");
  await expect(page.getByRole("radio", { name: "Alternativa A é a correta" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("textbox", { name: "Explicação", exact: true })).toHaveText("Dois mais dois é quatro.");
  await expect(page.getByText("Matemática", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Aritmética" })).toHaveAttribute("aria-checked", "true");
  expect(state.saved()).toBe(0);
});

test("autocompletar exibe Matemática com Equações mesmo após a primeira página de disciplinas", async ({ page }) => {
  const state = await setup(page, true, 200, { type: "multiple_choice", image_url: "" }, true);
  await page.goto(`${baseUrl}/#/questoes/123/editar`);
  await expect(page.getByText("Escreva ao menos 15 caracteres", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Autocompletar com IA", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Equações" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Matemática", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect.poll(state.saved).toBe(1);
  expect(state.saves[0]).toMatchObject({ subject_id: 10, topic_ids: [20] });
});

test("edição autocompleta respostas e classificação e salva juntas", async ({ page }) => {
  const state = await setup(page, true, 200, { type: "multiple_choice", image_url: "" });
  await page.goto(`${baseUrl}/#/questoes/123/editar`);
  const autofill = page.getByRole("button", { name: "Autocompletar com IA", exact: true });
  const similar = page.getByRole("button", { name: "Gerar similares com IA", exact: true });
  await expect(autofill).toHaveCount(1);
  await expect(similar).toHaveCount(1);
  await expect(autofill).toBeEnabled();
  await expect(page.getByText("Escolha a disciplina primeiro.", { exact: true })).toBeVisible();
  await autofill.click();
  await expect(page.getByRole("textbox", { name: "Texto da alternativa A" })).toHaveText("Quatro");
  await expect(page.getByRole("radio", { name: "Alternativa A é a correta" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Matemática", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Aritmética" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("ENEM", { exact: true })).toBeVisible();
  expect(state.saved()).toBe(0);
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect.poll(state.saved).toBe(1);
  expect(state.saves[0]).toMatchObject({
    type: "multiple_choice", subject_id: 10, topic_ids: [20], difficulty_id: 30,
    board_id: 40, year: 2020, tags: ["soma"],
    options: [{ option_text: "Quatro", is_correct: true }, { option_text: "Cinco", is_correct: false }],
  });
});

test("edição carrega classificação existente e avisa ao sair com mudança somente nela", async ({ page }) => {
  const state = await setup(page, true, 200, { subject_id: 11, is_annulled: true });
  await page.goto(`${baseUrl}/#/questoes/123/editar`);
  await expect(page.getByText("Português", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Anulada pela banca" })).toBeChecked();
  await page.getByRole("switch", { name: "Anulada pela banca" }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByText("Sair sem salvar?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect.poll(state.saved).toBe(1);
  expect(state.saves[0]).toMatchObject({ is_annulled: false });
  expect(state.saves[0]).not.toHaveProperty("subject_id");
});

test("autocompletar na edição preserva disciplina já preenchida", async ({ page }) => {
  const state = await setup(page, true, 200, { type: "multiple_choice", subject_id: 11, image_url: "" });
  await page.goto(`${baseUrl}/#/questoes/123/editar`);
  await expect(page.getByText("Português", { exact: true })).toBeVisible();
  await expect(page.getByText("Escreva ao menos 15 caracteres", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Autocompletar com IA", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Texto da alternativa A" })).toHaveText("Quatro");
  await expect(page.getByText("Português", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect.poll(state.saved).toBe(1);
  expect(state.saves[0]).not.toHaveProperty("subject_id");
  expect(state.saves[0]).not.toHaveProperty("topic_ids");
  expect(state.saves[0]).toMatchObject({ difficulty_id: 30, board_id: 40, tags: ["soma"] });
});

test("similares fica acima do conteúdo na tela de classificação", async ({ page }) => {
  await setup(page);
  await page.goto(`${baseUrl}/#/questoes/123`);
  const similar = page.getByRole("button", { name: "Gerar similares com IA", exact: true });
  const statement = page.getByText(sourceQuestion.question_text, { exact: true });
  await expect(similar).toHaveCount(1);
  await expect(statement).toBeVisible();
  expect((await similar.boundingBox())!.y).toBeLessThan((await statement.boundingBox())!.y);
});

test("ações de IA ficam somente no topo da edição nos dois temas e tamanhos", async ({ page }) => {
  await setup(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`${baseUrl}/#/questoes/123/editar`);
      const statement = page.getByRole("textbox", { name: "Enunciado", exact: true });
      await expect(statement).toBeVisible();
      for (const name of ["Autocompletar com IA", "Gerar similares com IA"]) {
        const button = page.getByRole("button", { name, exact: true });
        await expect(button).toHaveCount(1);
        await expect(button).toBeVisible();
        expect((await button.boundingBox())!.y).toBeLessThan((await statement.boundingBox())!.y);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    }
  }
});
test("Nova questão mantém botão visível e explica falta de credenciais", async ({ page }) => {
  const state = await setup(page, false);
  await page.goto(`${baseUrl}/#/questoes/nova`);
  await expect(page.getByRole("button", { name: "Autocompletar com IA", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Autocompletar com IA", exact: true })).toBeEnabled();
  await expect(page.getByText("Para autocompletar, cadastre uma chave", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Autocompletar com IA", exact: true }).click();
  await expect(page.getByText("Para usar a IA, cadastre uma chave em Configurações → Integração com IA.", { exact: true })).toBeVisible();
  expect(state.aiRequests()).toBe(0);
});

test("Autocompletar permanece clicável no erro 500 e permite tentar novamente", async ({ page }) => {
  const state = await setup(page, true, 500);
  await page.goto(`${baseUrl}/#/questoes/nova`);
  const button = page.getByRole("button", { name: "Autocompletar com IA", exact: true }).first();
  await expect(page.getByRole("button", { name: "Verificar IA novamente" })).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByText("Server Error Verifique a API e tente novamente.", { exact: true }).last()).toBeVisible();
  expect(state.aiRequests()).toBe(0);
  state.recoverStatus();
  await page.getByRole("textbox", { name: "Enunciado", exact: true }).fill("Quanto é a soma de dois e dois?");
  await button.click();
  await expect(page.getByRole("textbox", { name: "Texto da alternativa A" })).toHaveText("Quatro");
  expect(state.aiRequests()).toBe(1);
});

for (const statusCode of [200, 500]) {
  for (const path of ["123/editar", "123"]) {
    test(`similares fica visível em ${path} com IA indisponível (${statusCode})`, async ({ page }) => {
      const state = await setup(page, false, statusCode);
      await page.goto(`${baseUrl}/#/questoes/${path}`);
      const button = page.getByRole("button", { name: "Gerar similares com IA", exact: true });
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      await button.click();
      await expect(page.getByText(
        statusCode === 500
          ? "Server Error Verifique a API e tente novamente."
          : "Para usar a IA, cadastre uma chave em Configurações → Integração com IA.",
        { exact: true }
      ).last()).toBeVisible();
      expect(state.aiRequests()).toBe(0);
      if (path.endsWith("editar")) {
        await expect(page.getByRole("button", { name: "Autocompletar com IA", exact: true })).toBeVisible();
      }
    });
  }
  test(`menu da listagem mostra similares com IA indisponível (${statusCode})`, async ({ page }) => {
    const state = await setup(page, false, statusCode);
    await page.goto(`${baseUrl}/#/questoes`);
    await page.getByRole("button", { name: "Ações da questão 123" }).click();
    const button = page.getByText("Gerar similares com IA", { exact: true });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByText(
      statusCode === 500
        ? "Server Error Verifique a API e tente novamente."
        : "Para usar a IA, cadastre uma chave em Configurações → Integração com IA.",
      { exact: true }
    )).toBeVisible();
    expect(state.aiRequests()).toBe(0);
  });
}

test("Nova questão mantém botão e layout em mobile, tablet e desktop nos dois temas", async ({ page }) => {
  await setup(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`${baseUrl}/#/questoes/nova`);
      await expect(page.getByRole("button", { name: "Autocompletar com IA", exact: true })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    }
  }
});

test("revisão bloqueia dados editados até regenerar apenas a imagem", async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${baseUrl}/#/questoes/123/editar`);
  await page.getByRole("button", { name: "Gerar similares com IA", exact: true }).click();
  await page.getByRole("button", { name: "Gerar questões", exact: true }).click();
  const include = page.getByRole("button", { name: "Incluir 1 questão", exact: true });
  await expect(include).toBeEnabled();
  await expect(page.getByText("IA: imagem validada", { exact: false })).toBeVisible();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(include).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
  const editors = page.getByRole("textbox", { name: "Enunciado", exact: true });
  await editors.last().fill("Triângulo com 12 cm, 16 cm e 20 cm.");
  await expect(include).toBeDisabled();
  await page.getByRole("button", { name: "Regenerar imagem com IA", exact: true }).click();
  await expect(include).toBeEnabled();
  expect(state.regenerations).toHaveLength(1);
  expect(state.regenerations[0]).toMatchObject({ content: { question_text: "Triângulo com 12 cm, 16 cm e 20 cm." } });
  expect(state.saved()).toBe(0);
  await include.click();
  await expect.poll(state.saved).toBe(1);
});
