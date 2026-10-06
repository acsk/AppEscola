import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.PANEL_TEST_URL;
test.skip(!baseUrl, "Defina PANEL_TEST_URL com o servidor Expo web para validar a tela.");

const imageUrl = `${baseUrl}/mock-question.png`;
const generationId = "00000000-0000-4000-8000-000000000001";
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
} = {}, paginatedSubjects = false) {
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
    if (path.endsWith("/ai/status")) {
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
