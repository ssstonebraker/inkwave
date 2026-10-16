// E2E regression guard: `.raw-editor-line-number` must stay WCAG AA
// (4.5:1) legible against `.raw-editor-gutter`'s background in every
// shipped theme.
//
// Measured defect (2026-10-15): obsidianite/mocha/paper and 8 other
// themes used `color: var(--muted)` for gutter numbers, which fell as
// low as 2.14:1 (ctp-latte) against `--toolbar-bg`. Fixed by giving
// every theme its own `--gutter-text` variable (see style.css). This
// test re-derives the WCAG relative-luminance contrast formula in-browser
// (no external lib) so it fails loudly if any future theme edit
// reintroduces a sub-4.5:1 pair, without hardcoding expected hex values
// (which would make the test pass/fail on the wrong signal if colors are
// intentionally retuned later).
//
// Split into its own file (rather than appended to
// editor-mode-affordances.spec.js) per the repo's 500-line modular-file
// limit — adding this block there would have pushed that file to 518
// lines.
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride } from "./helpers.js";

const DOC_PATH = "/mock/notes/doc.md";

async function openDoc(page, content) {
  await setMockOverride(page, "open_file", {
    root: "/mock/notes", path: DOC_PATH, content,
  });
  await page.locator("#openBtn").click();
  await page.locator('#openMenu button[data-action="file"]').click();
  await expect(page.locator(".tab")).toHaveCount(1);
}

async function applyTheme(page, themeId) {
  // "obsidianite" is the body:not([data-theme]) default — apply by
  // removing the attribute rather than setting the literal string,
  // matching how js/ui.js's own theme switcher treats it (see
  // _committedTheme fallback in js/ui.js line 80).
  await page.evaluate((id) => {
    if (id === "obsidianite") {
      document.body.removeAttribute("data-theme");
    } else {
      document.body.setAttribute("data-theme", id);
    }
  }, themeId);
}

async function measureContrastRatio(page, selector, bgSelector) {
  return page.evaluate(
    ({ selector, bgSelector }) => {
      function parseRgb(colorStr) {
        const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      }
      function relLuminance([r, g, b]) {
        const chan = (c) => {
          c /= 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
      }
      const fgEl = document.querySelector(selector);
      const bgEl = document.querySelector(bgSelector);
      const fg = relLuminance(parseRgb(getComputedStyle(fgEl).color));
      const bg = relLuminance(parseRgb(getComputedStyle(bgEl).backgroundColor));
      const lighter = Math.max(fg, bg);
      const darker = Math.min(fg, bg);
      return (lighter + 0.05) / (darker + 0.05);
    },
    { selector, bgSelector }
  );
}

const THEME_IDS = [
  "obsidianite", "mocha", "paper", "sepia", "nord", "solarized-light",
  "high-contrast", "dracula", "rose-pine", "gruvbox", "lavender",
  "midnight", "forest", "molokai", "slime", "ctp-latte", "ctp-frappe",
  "ctp-macchiato",
];

test.describe("Gutter contrast — WCAG AA across all themes (regression guard)", () => {
  for (const themeId of THEME_IDS) {
    test(`"${themeId}" theme: gutter line numbers meet WCAG AA (4.5:1) against gutter background`, async ({ page }) => {
      await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
      await page.waitForSelector(".content", { state: "attached" });
      await openDoc(page, "line one\nline two\nline three");
      await applyTheme(page, themeId);

      await page.locator("#rawModeBtn").click();
      await expect(page.locator(".raw-editor-line-number").first()).toBeVisible();

      const ratio = await measureContrastRatio(page, ".raw-editor-line-number", ".raw-editor-gutter");
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }

  test("the current-line highlighted gutter number (uses --text, not --gutter-text) also stays WCAG AA across all themes", async ({ page }) => {
    // Separate variable, separate rule (.raw-editor-line-number.raw-editor-current-line
    // overrides color to var(--text)) — confirmed during the 2026-10-15
    // investigation that this variant was NOT affected by the --muted
    // bug, but it shares the same gutter background, so it is checked
    // here too rather than assumed safe.
    for (const themeId of THEME_IDS) {
      await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
      await page.waitForSelector(".content", { state: "attached" });
      await openDoc(page, "line one\nline two\nline three");
      await applyTheme(page, themeId);

      await page.locator("#rawModeBtn").click();
      const textarea = page.locator(".raw-editor");
      await expect(textarea).toBeVisible();
      await textarea.click();

      const ratio = await measureContrastRatio(
        page,
        ".raw-editor-line-number.raw-editor-current-line",
        ".raw-editor-gutter"
      );
      expect(ratio, `theme "${themeId}" current-line gutter contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
