// E2E coverage for zoom keyboard shortcuts (Cmd+=/Cmd+-/Cmd+0): the
// actual DOM transform:scale(...) effect, persistence across settings,
// and clamping at min/max. tests/js/zoom.test.js covers the scale-math
// internals in isolation; this verifies the keyboard wiring reaches
// real rendered DOM.
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

function getTransform(page) {
  return page.evaluate(() => {
    const el = document.querySelector("#content-primary .rendered");
    return el ? el.style.transform : null;
  });
}

test.describe("Zoom keyboard shortcuts", () => {
  test("Cmd+= increases the rendered content's scale transform", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\nSome text.");
    await expect.poll(() => getTransform(page)).toBe("");

    await page.keyboard.press(`${MOD}+=`);
    await expect.poll(() => getTransform(page)).toContain("scale(");
  });

  test("Cmd+- decreases the scale transform", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\nSome text.");
    await page.keyboard.press(`${MOD}+-`);
    const transform = await getTransform(page);
    expect(transform).toContain("scale(");
    const scaleValue = parseFloat(transform.match(/scale\(([\d.]+)\)/)[1]);
    expect(scaleValue).toBeLessThan(1);
  });

  test("Cmd+0 resets zoom back to no transform", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\nSome text.");
    await page.keyboard.press(`${MOD}+=`);
    await page.keyboard.press(`${MOD}+=`);
    await expect.poll(() => getTransform(page)).toContain("scale(");

    await page.keyboard.press(`${MOD}+0`);
    await expect.poll(() => getTransform(page)).toBe("");
  });

  test("zoom level persists across settings and survives reopening a file", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\nFirst doc.");
    await page.keyboard.press(`${MOD}+=`);
    await page.keyboard.press(`${MOD}+=`);
    await page.keyboard.press(`${MOD}+=`);
    const scaledTransform = await getTransform(page);
    expect(scaledTransform).toContain("scale(");

    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/second.md", content: "# Doc\n\nSecond doc.",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(2);

    // The zoom level is a global doc setting, not per-tab — the newly
    // opened file should render at the SAME scale.
    await expect.poll(() => getTransform(page)).toBe(scaledTransform);
  });

  test("repeated Cmd+= clamps at a maximum rather than growing unbounded", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\nSome text.");
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press(`${MOD}+=`);
    }
    const t1 = await getTransform(page);
    await page.keyboard.press(`${MOD}+=`);
    const t2 = await getTransform(page);
    expect(t2).toBe(t1); // no further growth once clamped at max
  });

  test("repeated Cmd+- clamps at a minimum rather than shrinking unbounded", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "# Doc\n\nSome text.");
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press(`${MOD}+-`);
    }
    const t1 = await getTransform(page);
    await page.keyboard.press(`${MOD}+-`);
    const t2 = await getTransform(page);
    expect(t2).toBe(t1); // no further shrinkage once clamped at min
  });
});
