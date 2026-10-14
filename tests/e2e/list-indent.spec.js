// E2E coverage for Tab/Shift+Tab list indent/outdent while editing a
// list item. reRenderAndResumeEdit() (js/editor.js) calls saveToFile()
// directly, so unlike the Enter-split gap found in
// core-block-editing.spec.js, Tab/outdent autosaves immediately —
// confirmed via source read before writing assertions.
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride, readWrittenFile } from "./helpers.js";

const DOC_PATH = "/mock/notes/list.md";
const LIST_MD = "# Doc\n\n- First item\n- Second item\n- Third item";

async function openListDoc(page) {
  await setMockOverride(page, "open_file", { root: "/mock/notes", path: DOC_PATH, content: LIST_MD });
  await page.locator("#openBtn").click();
  await page.locator('#openMenu button[data-action="file"]').click();
  await expect(page.locator(".tab")).toHaveCount(1);
}

test.describe("List item indent/outdent (Tab / Shift+Tab)", () => {
  test("Tab while editing a list item indents it to a nested sub-list", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openListDoc(page);
    await page.locator('.md-block-list[data-block-index="2"]').dblclick();
    await expect(page.locator(".md-block.editing")).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Tab");

    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toContain("  - Second item");
  });

  test("Shift+Tab outdents a nested item back to the top level", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: DOC_PATH, content: "# Doc\n\n- First item\n  - Nested item\n- Third item",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    await page.locator('.md-block-list[data-block-index="2"]').dblclick();
    await expect(page.locator(".md-block.editing")).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Shift+Tab");

    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .not.toContain("  - Nested item");
    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toContain("- Nested item");
  });

  test("indenting the first item (no sibling above) does nothing (nothing to nest under)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openListDoc(page);
    await page.locator('.md-block-list[data-block-index="1"]').dblclick();
    await expect(page.locator(".md-block.editing")).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);

    // First item has no preceding sibling at the same level to nest
    // under, so indentListItem() should be a no-op — content
    // unchanged from the original (not yet autosaved OR written
    // identically to the original, either way no indentation markup
    // should appear for "First item").
    const written = await readWrittenFile(page, DOC_PATH);
    if (written != null) {
      expect(written).not.toContain("  - First item");
    }
  });

  test("Tab indent preserves the item's own text content", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openListDoc(page);
    await page.locator('.md-block-list[data-block-index="2"]').dblclick();
    await expect(page.locator(".md-block.editing")).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Tab");

    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toContain("Second item");
    // Sibling items must be untouched.
    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toContain("- First item");
  });
});
