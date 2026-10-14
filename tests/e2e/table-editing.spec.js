// E2E coverage for table editing: double-click a cell to edit, type,
// commit via Enter/Escape/Tab/blur, and the right-click context menu's
// row/column insert/delete operations. tests/js/table.test.js already
// covers the raw-markdown parsing/rewriting math in isolation; this
// verifies the real dblclick -> contenteditable -> autosave pipeline
// and the context-menu click wiring end to end.
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride, readWrittenFile } from "./helpers.js";

const DOC_PATH = "/mock/notes/table.md";
const TABLE_MD =
  "# Doc\n\n" +
  "| A | B |\n" +
  "| --- | --- |\n" +
  "| a1 | b1 |\n" +
  "| a2 | b2 |";

async function openTableDoc(page) {
  await setMockOverride(page, "open_file", { root: "/mock/notes", path: DOC_PATH, content: TABLE_MD });
  await page.locator("#openBtn").click();
  await page.locator('#openMenu button[data-action="file"]').click();
  await expect(page.locator(".tab")).toHaveCount(1);
  await expect(page.locator(".md-block-table")).toBeVisible();
}

test.describe("Table editing — cell edit", () => {
  test("double-clicking a cell enters edit mode with its existing text", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTableDoc(page);
    const cell = page.locator(".md-block-table td", { hasText: "a1" }).first();
    await cell.dblclick();
    await expect(cell).toHaveAttribute("contenteditable", "true");
    await expect(cell).toHaveText("a1");
  });

  test("Enter commits the edit and autosaves the new cell value", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTableDoc(page);
    const cell = page.locator(".md-block-table td", { hasText: "a1" }).first();
    await cell.dblclick();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("edited");
    await page.keyboard.press("Enter");

    await expect(cell).not.toHaveAttribute("contenteditable", "true");
    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toContain("edited");
  });

  test("Escape commits the edit the same as Enter", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTableDoc(page);
    const cell = page.locator(".md-block-table td", { hasText: "b1" }).first();
    await cell.dblclick();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("escaped-value");
    await page.keyboard.press("Escape");

    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toContain("escaped-value");
  });

  test("Tab commits the current cell and moves editing to the next cell", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTableDoc(page);
    const firstCell = page.locator(".md-block-table td", { hasText: "a1" }).first();
    await firstCell.dblclick();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("tabbed");
    await page.keyboard.press("Tab");

    // The next cell (b1) should now be the one in edit mode.
    const nextCell = page.locator('.md-block-table td[contenteditable="true"]');
    await expect(nextCell).toHaveCount(1, { timeout: 2000 });
    await expect(nextCell).toHaveText("b1");
    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toContain("tabbed");
  });

  test("blurring the cell (clicking elsewhere) commits the edit", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTableDoc(page);
    const cell = page.locator(".md-block-table td", { hasText: "a2" }).first();
    await cell.dblclick();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("blurred-value");
    await page.locator(".toolbar").first().click();

    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toContain("blurred-value");
  });
});

test.describe("Table editing — context menu", () => {
  test("right-clicking a cell shows the table context menu", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTableDoc(page);
    const cell = page.locator(".md-block-table td", { hasText: "a1" }).first();
    await cell.click({ button: "right" });
    await expect(page.locator(".table-context-menu")).toBeVisible();
  });

  test("Insert row below adds a new row to the table", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTableDoc(page);
    const rowsBefore = await page.locator(".md-block-table tbody tr").count();
    const cell = page.locator(".md-block-table td", { hasText: "a1" }).first();
    await cell.click({ button: "right" });
    await page.locator(".table-context-menu button", { hasText: "Insert row below" }).click();

    await expect(page.locator(".md-block-table tbody tr")).toHaveCount(rowsBefore + 1);
    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .not.toBeUndefined();
  });

  test("Delete row removes the targeted row", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTableDoc(page);
    const rowsBefore = await page.locator(".md-block-table tbody tr").count();
    const cell = page.locator(".md-block-table td", { hasText: "a2" }).first();
    await cell.click({ button: "right" });
    await page.locator(".table-context-menu button", { hasText: "Delete row" }).click();

    await expect(page.locator(".md-block-table tbody tr")).toHaveCount(rowsBefore - 1);
    await expect(page.locator(".md-block-table td", { hasText: "a2" })).toHaveCount(0);
  });

  test("Insert column right adds a new column", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTableDoc(page);
    const colsBefore = await page.locator(".md-block-table thead th").count();
    const cell = page.locator(".md-block-table td", { hasText: "a1" }).first();
    await cell.click({ button: "right" });
    await page.locator(".table-context-menu button", { hasText: "Insert column right" }).click();

    await expect(page.locator(".md-block-table thead th")).toHaveCount(colsBefore + 1);
  });

  test("Delete column removes the targeted column", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTableDoc(page);
    const colsBefore = await page.locator(".md-block-table thead th").count();
    const cell = page.locator(".md-block-table td", { hasText: "b1" }).first();
    await cell.click({ button: "right" });
    await page.locator(".table-context-menu button", { hasText: "Delete column" }).click();

    await expect(page.locator(".md-block-table thead th")).toHaveCount(colsBefore - 1);
    await expect(page.locator(".md-block-table td", { hasText: "b1" })).toHaveCount(0);
  });

  test("right-clicking outside a table shows 'Insert table' instead", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/plain.md", content: "# Doc\n\nJust a paragraph, no table.",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    await page.locator('.md-block[data-block-index="1"]').click({ button: "right" });
    await expect(page.locator(".table-context-menu button", { hasText: "Insert table" })).toBeVisible();
  });
});
