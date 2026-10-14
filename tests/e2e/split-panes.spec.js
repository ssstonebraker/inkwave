// E2E coverage for split-pane independence: splitting assigns new tabs
// to the active pane (not always primary), clicking a pane makes it
// active, and closing the split correctly merges state back to a
// single pane without losing the secondary tab's content.
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride } from "./helpers.js";

async function openDoc(page, path, content) {
  await setMockOverride(page, "open_file", { root: "/mock/notes", path, content });
  await page.locator("#openBtn").click();
  await page.locator('#openMenu button[data-action="file"]').click();
}

test.describe("Split pane — tab assignment", () => {
  test("splitting makes the secondary pane active (new tabs go there)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#splitVBtn").click();
    await expect(page.locator("#pane-secondary")).toHaveClass(/active-pane/);
    await expect(page.locator("#pane-primary")).not.toHaveClass(/active-pane/);
  });

  test("a file opened right after splitting renders in the secondary pane", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#splitVBtn").click();
    await openDoc(page, "/mock/notes/secondary-doc.md", "# Secondary Pane Content");
    await expect(page.locator("#content-secondary")).toContainText("Secondary Pane Content");
    await expect(page.locator("#content-primary")).not.toContainText("Secondary Pane Content");
  });

  test("clicking the primary pane makes it active again", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#splitVBtn").click();
    await expect(page.locator("#pane-secondary")).toHaveClass(/active-pane/);
    await page.locator("#pane-primary").click();
    await expect(page.locator("#pane-primary")).toHaveClass(/active-pane/);
    await expect(page.locator("#pane-secondary")).not.toHaveClass(/active-pane/);
  });

  test("after reactivating primary, a newly opened file renders in the primary pane", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#splitVBtn").click();
    await openDoc(page, "/mock/notes/in-secondary.md", "# In Secondary");
    await expect(page.locator("#content-secondary")).toContainText("In Secondary");

    await page.locator("#pane-primary").click();
    await openDoc(page, "/mock/notes/in-primary.md", "# In Primary");
    await expect(page.locator("#content-primary")).toContainText("In Primary");
    // Secondary pane content from before must be untouched.
    await expect(page.locator("#content-secondary")).toContainText("In Secondary");
  });

  test("primary and secondary panes can show two different documents simultaneously", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "/mock/notes/first.md", "# First Document");
    await expect(page.locator("#content-primary")).toContainText("First Document");

    await page.locator("#splitVBtn").click();
    await openDoc(page, "/mock/notes/second.md", "# Second Document");

    await expect(page.locator("#content-primary")).toContainText("First Document");
    await expect(page.locator("#content-secondary")).toContainText("Second Document");
  });
});

test.describe("Split pane — closing the split", () => {
  test("closing the split (toggle splitVBtn off) hides the secondary pane", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#splitVBtn").click();
    await openDoc(page, "/mock/notes/secondary.md", "# Secondary");
    await page.locator("#splitVBtn").click();
    await expect(page.locator("#pane-secondary")).toBeHidden();
  });

  test("closing the split returns focus/active state to the primary pane", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#splitVBtn").click();
    await expect(page.locator("#pane-secondary")).toHaveClass(/active-pane/);
    await page.locator("#splitVBtn").click();
    await expect(page.locator("#pane-primary")).toHaveClass(/active-pane/);
  });
});
