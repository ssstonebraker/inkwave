// E2E coverage for Table of Contents navigation: heading extraction,
// empty-document message, click-to-scroll, keyboard activation
// (Enter/Space), and re-rendering when the active tab changes.
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride } from "./helpers.js";

async function openDocWithHeadings(page, content) {
  await setMockOverride(page, "open_file", {
    root: "/mock/notes", path: "/mock/notes/doc.md", content,
  });
  await page.locator("#openBtn").click();
  await page.locator('#openMenu button[data-action="file"]').click();
  await expect(page.locator(".tab")).toHaveCount(1);
}

test.describe("Table of contents — content extraction", () => {
  test("shows an empty message for a document with no headings", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDocWithHeadings(page, "Just a plain paragraph, no headings at all.");
    await page.locator("#tocBtn").click();
    await expect(page.locator("#tocBody")).toContainText("No headings found");
  });

  test("lists every heading from the active document", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDocWithHeadings(page, "# Intro\n\nSome text.\n\n## Details\n\nMore text.\n\n## Conclusion\n\nFinal text.");
    await page.locator("#tocBtn").click();
    const items = page.locator("#tocBody .toc-item");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText("Intro");
    await expect(items.nth(1)).toHaveText("Details");
    await expect(items.nth(2)).toHaveText("Conclusion");
  });

  test("heading depth is reflected in the toc-depth-N class", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDocWithHeadings(page, "# Top level\n\n## Nested level\n\ntext");
    await page.locator("#tocBtn").click();
    await expect(page.locator("#tocBody .toc-item").nth(0)).toHaveClass(/toc-depth-1/);
    await expect(page.locator("#tocBody .toc-item").nth(1)).toHaveClass(/toc-depth-2/);
  });
});

test.describe("Table of contents — navigation", () => {
  test("clicking a TOC item scrolls the matching heading into view", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    // Enough padding paragraphs that "Far Below" starts off-screen.
    const filler = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} filler text.`).join("\n\n");
    await openDocWithHeadings(page, `# Top\n\n${filler}\n\n## Far Below\n\nTarget content.`);
    await page.locator("#tocBtn").click();

    const target = page.locator("#content-primary").getByText("Far Below", { exact: true });
    await expect(target).not.toBeInViewport();
    await page.locator("#tocBody .toc-item", { hasText: "Far Below" }).click();
    await expect(target).toBeInViewport({ timeout: 2000 });
  });

  test("keyboard Enter on a focused TOC item activates it the same as a click", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const filler = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} filler text.`).join("\n\n");
    await openDocWithHeadings(page, `# Top\n\n${filler}\n\n## Keyboard Target\n\nContent.`);
    await page.locator("#tocBtn").click();

    const item = page.locator("#tocBody .toc-item", { hasText: "Keyboard Target" });
    await item.focus();
    await item.press("Enter");

    const target = page.locator("#content-primary").getByText("Keyboard Target", { exact: true });
    await expect(target).toBeInViewport({ timeout: 2000 });
  });

  test("keyboard Space on a focused TOC item also activates it", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const filler = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} filler text.`).join("\n\n");
    await openDocWithHeadings(page, `# Top\n\n${filler}\n\n## Space Target\n\nContent.`);
    await page.locator("#tocBtn").click();

    const item = page.locator("#tocBody .toc-item", { hasText: "Space Target" });
    await item.focus();
    await item.press(" ");

    const target = page.locator("#content-primary").getByText("Space Target", { exact: true });
    await expect(target).toBeInViewport({ timeout: 2000 });
  });

  test("TOC re-renders when switching to a different tab with different headings", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDocWithHeadings(page, "# First Doc Heading\n\ntext");
    await page.locator("#tocBtn").click();
    await expect(page.locator("#tocBody .toc-item")).toHaveText(["First Doc Heading"]);

    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/second.md", content: "# Second Doc Heading\n\ntext",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(2);

    await expect(page.locator("#tocBody .toc-item")).toHaveText(["Second Doc Heading"]);
  });
});
