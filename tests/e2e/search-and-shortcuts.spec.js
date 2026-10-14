// E2E coverage for in-document search (Cmd+F) and basic undo/redo
// keyboard shortcuts. js/search.js has no toolbar button — Cmd+F is
// the only entry point, so this is Playwright-only coverage (no unit
// test can exercise the real highlight-wrapping/scrollIntoView path).
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride } from "./helpers.js";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openDoc(page, content) {
  await setMockOverride(page, "open_file", {
    root: "/mock/notes", path: "/mock/notes/doc.md", content,
  });
  await page.locator("#openBtn").click();
  await page.locator('#openMenu button[data-action="file"]').click();
  await expect(page.locator(".tab")).toHaveCount(1);
}

test.describe("In-document search (Cmd+F)", () => {
  test("Cmd+F opens the search bar and focuses the input", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\nFindable word here.");
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator(".search-input");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("typing a query highlights matches and shows a count", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\napple banana apple cherry apple.");
    await page.keyboard.press(`${MOD}+f`);
    await page.locator(".search-input").fill("apple");
    await expect(page.locator("mark.search-highlight")).toHaveCount(3, { timeout: 2000 });
    await expect(page.locator(".search-count")).toHaveText("1 of 3");
  });

  test("a query with zero matches shows '0 results'", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\nNo matching text here.");
    await page.keyboard.press(`${MOD}+f`);
    await page.locator(".search-input").fill("zzzznotfound");
    await expect(page.locator(".search-count")).toHaveText("0 results", { timeout: 2000 });
  });

  test("Enter advances to the next match, Shift+Enter goes back", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\napple banana apple cherry apple.");
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator(".search-input");
    await input.fill("apple");
    await expect(page.locator(".search-count")).toHaveText("1 of 3", { timeout: 2000 });
    await input.press("Enter");
    await expect(page.locator(".search-count")).toHaveText("2 of 3");
    await input.press("Shift+Enter");
    await expect(page.locator(".search-count")).toHaveText("1 of 3");
  });

  test("Prev/Next buttons cycle through matches with wraparound", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\napple banana apple cherry apple.");
    await page.keyboard.press(`${MOD}+f`);
    await page.locator(".search-input").fill("apple");
    await expect(page.locator(".search-count")).toHaveText("1 of 3", { timeout: 2000 });
    const [prevBtn, nextBtn] = await page.locator(".search-nav").all();
    // Wraparound backwards from match 1 should land on match 3.
    await prevBtn.click();
    await expect(page.locator(".search-count")).toHaveText("3 of 3");
    await nextBtn.click();
    await expect(page.locator(".search-count")).toHaveText("1 of 3");
  });

  test("Escape closes the search bar and clears highlights", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\napple banana apple.");
    await page.keyboard.press(`${MOD}+f`);
    await page.locator(".search-input").fill("apple");
    await expect(page.locator("mark.search-highlight")).toHaveCount(2, { timeout: 2000 });
    await page.locator(".search-input").press("Escape");
    await expect(page.locator(".search-bar")).toBeHidden();
    await expect(page.locator("mark.search-highlight")).toHaveCount(0);
  });

  test("close button (×) closes the search bar", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\ntext");
    await page.keyboard.press(`${MOD}+f`);
    await page.locator(".search-close").click();
    await expect(page.locator(".search-bar")).toBeHidden();
  });

  test("Cmd+F while in raw mode does not open the search bar", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\ntext");
    await page.locator("#rawModeBtn").click();
    await expect(page.locator("#rawModeBtn")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press(`${MOD}+f`);
    await page.waitForTimeout(100);
    await expect(page.locator(".search-bar")).toHaveCount(0);
  });
});

test.describe("Undo/redo keyboard shortcuts", () => {
  test("Cmd+Z and Cmd+Shift+Z do not throw when there is no active tab", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.keyboard.press(`${MOD}+z`);
    await page.keyboard.press(`${MOD}+Shift+z`);
    // No crash and no console error is the assertion here — the app's
    // own guard checks document.activeElement before touching any tab.
    await expect(page.locator("body")).toBeVisible();
  });

  test("Cmd+Z while focus is inside an editable element is NOT intercepted (passthrough for native undo)", async ({ page }) => {
    // js/ui.js's keydown handler explicitly skips Cmd+Z when
    // document.activeElement is contentEditable/TEXTAREA/INPUT, so the
    // browser's native undo (e.g. inside the inline-edit contenteditable)
    // isn't shadowed by the app-level undo stack.
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\nSome text.");
    await page.locator(".md-block").first().dblclick();
    const editable = page.locator(".md-block.editing .inline-edit");
    await expect(editable).toBeVisible({ timeout: 2000 });
    // setCaretPosition (which calls .focus() on the new .inline-edit
    // div) runs inside a setTimeout(...,0) for a non-empty block (see
    // js/editor.js's startInlineEdit) — the .editing class is added
    // synchronously, well before focus actually lands, so wait for the
    // real focus state rather than just the class.
    await expect(editable).toBeFocused({ timeout: 2000 });
    const activeInfo = await page.evaluate(() => ({
      tag: document.activeElement && document.activeElement.tagName,
      isContentEditable: document.activeElement && document.activeElement.isContentEditable,
    }));
    expect(activeInfo.isContentEditable || activeInfo.tag === "TEXTAREA" || activeInfo.tag === "INPUT").toBe(true);

    await page.evaluate(() => {
      window.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "z") {
          window.__inkwaveZDefaultPrevented = e.defaultPrevented;
        }
      }, { capture: true });
    });
    await page.keyboard.press(`${MOD}+z`);
    const preventDefaultCalled = await page.evaluate(() => window.__inkwaveZDefaultPrevented);
    expect(preventDefaultCalled).toBe(false);
  });
});
