// E2E coverage for GFM task-list checkbox toggling: clicking a
// rendered checkbox flips its [ ]/[x] markdown state and autosaves
// immediately (confirmed via source read: wireCheckboxes in
// js/renderer.js calls saveToFile(tab) directly in the click handler).
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride, readWrittenFile } from "./helpers.js";

const DOC_PATH = "/mock/notes/tasks.md";
const TASKS_MD =
  "# Tasks\n\n" +
  "- [ ] First task\n" +
  "- [x] Second task (already done)\n" +
  "- [ ] Third task";

async function openTasksDoc(page) {
  await setMockOverride(page, "open_file", { root: "/mock/notes", path: DOC_PATH, content: TASKS_MD });
  await page.locator("#openBtn").click();
  await page.locator('#openMenu button[data-action="file"]').click();
  await expect(page.locator(".tab")).toHaveCount(1);
}

test.describe("Checkbox task-list toggling", () => {
  test("checkboxes render unchecked/checked matching the markdown", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTasksDoc(page);
    const checkboxes = page.locator('#content-primary input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(3);
    await expect(checkboxes.nth(0)).not.toBeChecked();
    await expect(checkboxes.nth(1)).toBeChecked();
    await expect(checkboxes.nth(2)).not.toBeChecked();
  });

  test("clicking an unchecked checkbox checks it and autosaves [x]", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTasksDoc(page);
    const checkboxes = page.locator('#content-primary input[type="checkbox"]');
    await checkboxes.nth(0).click();
    await expect(checkboxes.nth(0)).toBeChecked();

    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toContain("- [x] First task");
  });

  test("clicking a checked checkbox unchecks it and autosaves [ ]", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTasksDoc(page);
    const checkboxes = page.locator('#content-primary input[type="checkbox"]');
    await checkboxes.nth(1).click();
    await expect(checkboxes.nth(1)).not.toBeChecked();

    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toContain("- [ ] Second task");
  });

  test("toggling one checkbox does not affect the others", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTasksDoc(page);
    const checkboxes = page.locator('#content-primary input[type="checkbox"]');
    await checkboxes.nth(2).click();

    await expect
      .poll(() => readWrittenFile(page, DOC_PATH))
      .toBe("# Tasks\n\n- [ ] First task\n- [x] Second task (already done)\n- [x] Third task");
    // First task must remain untouched.
    await expect(checkboxes.nth(0)).not.toBeChecked();
  });

  test("checkboxes are not disabled (interactive, not just visual)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openTasksDoc(page);
    const checkboxes = page.locator('#content-primary input[type="checkbox"]');
    for (let i = 0; i < 3; i++) {
      await expect(checkboxes.nth(i)).toBeEnabled();
    }
  });
});
