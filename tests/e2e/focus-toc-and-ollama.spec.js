// E2E coverage for two real, wired buttons that had zero test coverage
// despite having real production click handlers: focusTocBtn (the TOC
// toggle visible only in focus mode, since the regular toolbar
// including #tocBtn is hidden there) and ollamaRefreshBtn (fetches and
// repopulates the Ollama model dropdown). Found via a systematic sweep
// cross-referencing every id="...Btn" in index.html against what's
// actually clicked across all other spec files — six candidates
// found; four (apiKeySetBtn/apiKeyDeleteBtn/apiKeySaveBtn/
// apiKeyCancelBtn) turned out to be dead legacy markup explicitly
// commented "kept for backward compat with old settings.js refs" in
// index.html and referenced by zero JS — correctly left untested, not
// a real gap. These two ARE real gaps.
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride } from "./helpers.js";

test.describe("focusTocBtn — TOC toggle while in focus mode", () => {
  test("focusTocBtn opens the TOC panel from within focus mode", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/doc.md", content: "# Heading\n\ntext",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    await page.locator("#focusBtn").click();
    await expect(page.locator("body")).toHaveAttribute("data-focus-mode", "true");

    const panel = page.locator("#tocPanel");
    await expect(panel).toHaveAttribute("inert", "");
    await page.locator("#focusTocBtn").click();
    await expect(panel).not.toHaveAttribute("inert", "");
    await expect(page.locator("#focusTocBtn")).toHaveAttribute("aria-pressed", "true");
  });

  test("focusTocBtn and the regular tocBtn share the same open/close state", async ({ page }) => {
    // toggleToc() (js/toc.js) is a single shared function both buttons
    // call — opening via focusTocBtn then checking the regular tocBtn's
    // aria-pressed (even though it's visually hidden in focus mode)
    // proves there's one toggle state, not two independent ones.
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/doc.md", content: "# Heading\n\ntext",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    await page.locator("#focusBtn").click();
    await page.locator("#focusTocBtn").click();
    await expect(page.locator("#tocBtn")).toHaveAttribute("aria-pressed", "true");

    await page.locator("#focusTocBtn").click();
    await expect(page.locator("#tocBtn")).toHaveAttribute("aria-pressed", "false");
  });

  test("exiting focus mode while the TOC is open does not break the regular toolbar", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/doc.md", content: "# Heading\n\ntext",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    await page.locator("#focusBtn").click();
    await page.locator("#focusTocBtn").click();
    await expect(page.locator("#tocPanel")).not.toHaveAttribute("inert", "");

    await page.locator("#focusExitBtn").click();
    await expect(page.locator("body")).not.toHaveAttribute("data-focus-mode", "true");
    // TOC panel state itself is independent of focus mode exit — it
    // should still reflect whatever the user left it as (open), since
    // focus mode exit doesn't force-close side panels.
    await expect(page.locator("#tocBtn")).toBeVisible();
  });
});

test.describe("ollamaRefreshBtn — Ollama model list refresh", () => {
  test("clicking refresh fetches and populates the model dropdown", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#llmProviderSelect").selectOption("ollama");
    await expect(page.locator("#llmModelSelect")).toContainText("No models");

    await setMockOverride(page, "list_ollama_models", { models: ["llama3.2", "mistral", "codellama"] });
    await page.locator("#ollamaRefreshBtn").click();

    const options = page.locator("#llmModelSelect option");
    await expect(options).toHaveCount(3, { timeout: 2000 });
    await expect(options.nth(0)).toHaveText("llama3.2");
    await expect(options.nth(1)).toHaveText("mistral");
    await expect(options.nth(2)).toHaveText("codellama");
  });

  test("refresh with Ollama not running (empty models) shows the fallback message", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#llmProviderSelect").selectOption("ollama");
    await setMockOverride(page, "list_ollama_models", { models: [] });
    await page.locator("#ollamaRefreshBtn").click();

    await expect(page.locator("#llmModelSelect")).toContainText("No models (start Ollama)", { timeout: 2000 });
  });

  test("refresh preserves the currently selected model if it's still in the new list", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#llmProviderSelect").selectOption("ollama");
    await setMockOverride(page, "list_ollama_models", { models: ["llama3.2", "mistral"] });
    await page.locator("#ollamaRefreshBtn").click();
    await expect(page.locator("#llmModelSelect option")).toHaveCount(2, { timeout: 2000 });
    await page.locator("#llmModelSelect").selectOption("mistral");

    await setMockOverride(page, "list_ollama_models", { models: ["llama3.2", "mistral", "phi3"] });
    await page.locator("#ollamaRefreshBtn").click();
    await expect(page.locator("#llmModelSelect option")).toHaveCount(3, { timeout: 2000 });
    await expect(page.locator("#llmModelSelect")).toHaveValue("mistral");
  });
});
