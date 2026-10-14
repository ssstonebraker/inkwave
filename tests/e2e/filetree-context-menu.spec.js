// E2E coverage for the file-tree context menu: right-click to open,
// "New file here" (reuses createInFolder's prompt() flow, scoped to
// the right-clicked folder/file's parent dir), and "Delete" (native
// confirm() dialog + delete_file + tab cleanup if the deleted file was
// open). Also covers the empty-tree-area right-click fallback (uses
// treeRoot directly, New file here only shown if a folder is open).
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride, readDraftsRegistry } from "./helpers.js";

async function openFolderWithFiles(page, files) {
  await setMockOverride(page, "open_folder", { root: "/mock/project" });
  await setMockOverride(page, "list_dir", files);
  await page.locator("#openBtn").click();
  await page.locator('#openMenu button[data-action="folder"]').click();
  // initTree() always renders the opened folder itself as the first
  // .tree-item (the root node, ALSO classed .folder — not just
  // children get that class), THEN loads+renders its children
  // separately via list_dir. Total .tree-item count is always
  // files.length + 1 (the root). Tests target children by their exact
  // [data-path] (set to entry.path from list_dir), never by nth-match
  // on a bare .tree-item/.folder/.file selector, since the root is
  // ambiguously classed the same as a folder child.
  await expect(page.locator("#tree .tree-item")).toHaveCount(files.length + 1, { timeout: 2000 });
}

test.describe("File tree — context menu on a file", () => {
  const FILE = { name: "notes.md", path: "/mock/project/notes.md", isDir: false };

  test("right-clicking a file shows New file here and Delete", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openFolderWithFiles(page, [FILE]);
    await page.locator(`.tree-item[data-path="${FILE.path}"]`).click({ button: "right" });
    await expect(page.locator("#treeContextMenu")).toHaveClass(/visible/);
    await expect(page.locator("#newFileHereBtn")).toBeVisible();
    await expect(page.locator("#deleteFileBtn")).toBeVisible();
  });

  test("Delete with confirm() accepted calls delete_file and removes the tab if open", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openFolderWithFiles(page, [FILE]);
    await setMockOverride(page, "read_file", { path: FILE.path, content: "# Notes" });
    await page.locator(`.tree-item[data-path="${FILE.path}"]`).click();
    await expect(page.locator(".tab")).toHaveCount(1, { timeout: 2000 });

    page.once("dialog", (dialog) => {
      expect(dialog.type()).toBe("confirm");
      dialog.accept();
    });
    await page.locator(`.tree-item[data-path="${FILE.path}"]`).click({ button: "right" });
    await page.locator("#deleteFileBtn").click();

    await expect(page.locator(".tab")).toHaveCount(0, { timeout: 2000 });
  });

  test("Delete with confirm() dismissed does nothing", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openFolderWithFiles(page, [FILE]);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator(`.tree-item[data-path="${FILE.path}"]`).click({ button: "right" });
    await page.locator("#deleteFileBtn").click();
    await page.waitForTimeout(100);
    // The child tree item should still exist — nothing was deleted.
    await expect(page.locator(`.tree-item[data-path="${FILE.path}"]`)).toHaveCount(1);
  });

  test("New file here from a file's context menu creates a sibling file", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openFolderWithFiles(page, [FILE]);
    page.once("dialog", (dialog) => dialog.accept("Sibling.md"));
    await page.locator(`.tree-item[data-path="${FILE.path}"]`).click({ button: "right" });
    await page.locator("#newFileHereBtn").click();

    await expect(page.locator(".tab")).toHaveCount(1, { timeout: 2000 });
    await expect(page.locator(".tab")).toContainText("Sibling.md");
    const registry = await readDraftsRegistry(page);
    expect(Object.keys(registry).some((p) => p.endsWith("Sibling.md"))).toBe(true);
  });
});

test.describe("File tree — context menu on a folder", () => {
  const SUBDIR = { name: "subdir", path: "/mock/project/subdir", isDir: true };

  test("right-clicking a subfolder shows New file here but NOT Delete", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openFolderWithFiles(page, [SUBDIR]);
    await page.locator(`.tree-item[data-path="${SUBDIR.path}"]`).click({ button: "right" });
    await expect(page.locator("#newFileHereBtn")).toBeVisible();
    await expect(page.locator("#deleteFileBtn")).toBeHidden();
  });
});

test.describe("File tree — context menu on empty tree area", () => {
  test("right-clicking empty tree space with a folder open shows New file here, no Delete", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openFolderWithFiles(page, []);
    await page.locator(".tree-wrap").click({ button: "right", position: { x: 10, y: 180 } });
    await expect(page.locator("#treeContextMenu")).toHaveClass(/visible/);
    await expect(page.locator("#newFileHereBtn")).toBeVisible();
    await expect(page.locator("#deleteFileBtn")).toBeHidden();
  });

  test("right-clicking empty tree space with NO folder open shows no New file here option", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator(".tree-wrap").click({ button: "right", position: { x: 10, y: 10 } });
    await expect(page.locator("#treeContextMenu")).toHaveClass(/visible/);
    await expect(page.locator("#newFileHereBtn")).toBeHidden();
  });
});
