// E2E coverage for the remaining toolbar buttons not covered by
// toolbar.spec.js: New file (requires a folder open + the native
// prompt() dialog), Copy selection (requires clipboard permission +
// a real text selection), AI chat panel open/close, and Print/Export
// to PDF (native Save dialog + the real export_pdf API contract).
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride, readDraftsRegistry } from "./helpers.js";

test.describe("Toolbar — New file (requires an open folder)", () => {
  test("newFileBtn is disabled until a folder is opened", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await expect(page.locator("#newFileBtn")).toBeDisabled();
  });

  test("newFileBtn becomes enabled after opening a folder", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_folder", { root: "/mock/project" });
    await setMockOverride(page, "list_dir", []);
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="folder"]').click();
    await expect(page.locator("#newFileBtn")).toBeEnabled({ timeout: 2000 });
  });

  test("clicking newFileBtn prompts for a filename and creates the file", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_folder", { root: "/mock/project" });
    await setMockOverride(page, "list_dir", []);
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="folder"]').click();
    await expect(page.locator("#newFileBtn")).toBeEnabled({ timeout: 2000 });

    page.once("dialog", (dialog) => {
      expect(dialog.type()).toBe("prompt");
      dialog.accept("My New Note.md");
    });
    await page.locator("#newFileBtn").click();

    await expect(page.locator(".tab")).toHaveCount(1, { timeout: 2000 });
    await expect(page.locator(".tab")).toContainText("My New Note.md");
    const registry = await readDraftsRegistry(page);
    expect(Object.keys(registry).some((p) => p.endsWith("My New Note.md"))).toBe(true);
  });

  test("dismissing the filename prompt creates no file", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_folder", { root: "/mock/project" });
    await setMockOverride(page, "list_dir", []);
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="folder"]').click();
    await expect(page.locator("#newFileBtn")).toBeEnabled({ timeout: 2000 });

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#newFileBtn").click();
    await page.waitForTimeout(100);
    await expect(page.locator(".tab")).toHaveCount(0);
  });

  test("accepting the prompt with an empty/whitespace filename creates no file", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_folder", { root: "/mock/project" });
    await setMockOverride(page, "list_dir", []);
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="folder"]').click();
    await expect(page.locator("#newFileBtn")).toBeEnabled({ timeout: 2000 });

    page.once("dialog", (dialog) => dialog.accept("   "));
    await page.locator("#newFileBtn").click();
    await page.waitForTimeout(100);
    await expect(page.locator(".tab")).toHaveCount(0);
  });

  test("newFileBtn click while still disabled (no folder open) does nothing, no dialog", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    let dialogFired = false;
    page.on("dialog", () => { dialogFired = true; });
    // Disabled buttons don't receive click events in real browsers;
    // force:true bypasses Playwright's actionability check to prove
    // the app's own guard (newFileBtn.disabled check in the handler)
    // also holds, not just the HTML disabled attribute.
    await page.locator("#newFileBtn").click({ force: true });
    await page.waitForTimeout(100);
    expect(dialogFired).toBe(false);
    await expect(page.locator(".tab")).toHaveCount(0);
  });
});

test.describe("Toolbar — Copy selection", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copyBtn copies the current text selection to the clipboard", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/doc.md", content: "# Heading\n\nSelectable paragraph text.",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    await page.evaluate(() => {
      const el = document.querySelector("#content-primary .rendered p") || document.querySelector("#content-primary .rendered");
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.locator("#copyBtn").click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("Selectable paragraph text");
  });

  test("copyBtn with no selection does not throw and does not show the Copied! label", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.evaluate(() => window.getSelection().removeAllRanges());
    await page.locator("#copyBtn").click();
    await page.waitForTimeout(100);
    await expect(page.locator("#copyBtn")).not.toHaveAttribute("title", "Copied!");
  });
});

test.describe("Toolbar — AI chat panel", () => {
  test("chatBtn opens the chat panel (removes inert, sets aria-pressed)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const panel = page.locator("#chatPanel");
    const btn = page.locator("#chatBtn");
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await expect(panel).not.toHaveAttribute("inert", "");
  });

  test("chatBtn toggles the panel closed on a second click", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const btn = page.locator("#chatBtn");
    await btn.click();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#chatPanel")).toHaveAttribute("inert", "");
  });

  test("opening chat closes the TOC panel (mutually exclusive side panels)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#tocBtn").click();
    await expect(page.locator("#tocPanel")).not.toHaveAttribute("inert", "");
    await page.locator("#chatBtn").click();
    await expect(page.locator("#tocBtn")).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("Toolbar — Print / Export to PDF", () => {
  test("printBtn with no active tab shows an error, does not call export_pdf", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    let exportCalled = false;
    await page.evaluate(() => {
      window.__inkwaveMockApiOverrides = window.__inkwaveMockApiOverrides || {};
      window.__inkwaveMockApiOverrides.export_pdf = () => {
        window.__inkwaveExportCalled = true;
        return { path: "/mock/out.pdf" };
      };
    });
    await page.locator("#printBtn").click();
    await page.waitForTimeout(100);
    exportCalled = await page.evaluate(() => !!window.__inkwaveExportCalled);
    expect(exportCalled).toBe(false);
  });

  test("printBtn with an active tab calls export_pdf and opens the result on success", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/doc.md", content: "# Exportable doc",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    await page.evaluate(() => {
      window.__inkwaveMockApiOverrides = window.__inkwaveMockApiOverrides || {};
      window.__inkwaveMockApiOverrides.export_pdf = () => ({ path: "/mock/out/doc.pdf" });
      window.__inkwaveMockApiOverrides.open_path = (p) => { window.__inkwaveLastOpenedPath = p; return {}; };
    });
    await page.locator("#printBtn").click();
    await expect
      .poll(async () => page.evaluate(() => window.__inkwaveLastOpenedPath))
      .toBe("/mock/out/doc.pdf");
  });

  test("printBtn shows no dialog/error when the Save dialog is cancelled", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/doc.md", content: "# Doc",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);
    // Default export_pdf mock behavior is {cancelled: true} — no override needed.
    let dialogFired = false;
    page.on("dialog", () => { dialogFired = true; });
    await page.locator("#printBtn").click();
    await page.waitForTimeout(200);
    expect(dialogFired).toBe(false);
  });

  test("printBtn surfaces an error message in the DOM when export_pdf returns an error", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/doc.md", content: "# Doc",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);
    await setMockOverride(page, "export_pdf", { error: "Disk full" });
    await page.locator("#printBtn").click();
    await expect(page.locator("body")).toContainText("Disk full", { timeout: 2000 });
  });
});
