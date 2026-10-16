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

function relLuminance([r, g, b]) {
  const chan = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function pixelContrast(fgRgb, bgRgb) {
  const fg = relLuminance(fgRgb);
  const bg = relLuminance(bgRgb);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Screenshot the gutter and the single line-number element, decode the
 * actual rasterized PNG pixels (via the `pngjs` already-vendored decoder
 * is unavailable here, so this uses the simplest dependency-free route:
 * read raw RGBA bytes through a canvas round-trip in-browser), and
 * return { textPixelCount, bgSampleRgb, darkestTextPixelRgb }.
 *
 * This exists because getComputedStyle().color (used by
 * measureContrastRatio above) proves the CSS *declares* the right
 * color, but does not prove anything was actually painted to the
 * screen — a 0-opacity element, a clip-path hiding it, or a z-index
 * stacking bug would still report a perfect getComputedStyle() color
 * while being functionally invisible. This function samples real
 * pixels to catch exactly that class of bug, which the user hit
 * ("I can't even see line numbers in the build").
 */
async function samplePaintedGutterPixels(page) {
  return page.evaluate(() => {
    const gutter = document.querySelector(".raw-editor-gutter");
    const marker = document.querySelector(".raw-editor-line-number");
    if (!gutter || !marker) return null;

    const gutterRect = gutter.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    if (gutterRect.width === 0 || gutterRect.height === 0) {
      return { error: "gutter has zero size — not painted" };
    }
    if (markerRect.width === 0 || markerRect.height === 0) {
      return { error: "line-number marker has zero size — not painted" };
    }

    // Render the live gutter DOM subtree into a canvas via SVG
    // foreignObject, then read back real painted pixels. This forces
    // the browser to actually rasterize fonts/colors/opacity/clipping —
    // not just report the CSSOM values.
    return new Promise((resolve) => {
      const w = Math.ceil(gutterRect.width);
      const h = Math.ceil(gutterRect.height);
      const clone = gutter.cloneNode(true);
      const xml = new XMLSerializer().serializeToString(clone);
      const svgMarkup =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
        `<foreignObject width="100%" height="100%">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;">${xml}</div>` +
        `</foreignObject></svg>`;
      // data: URI, not blob: — blob: URLs fire a page.on("request")
      // network event in this harness's offline-enforcement check
      // (helpers.js gotoApp()), which correctly treats any non-local
      // request as a regression. A data: URI assigned to img.src is
      // resolved synchronously in-process and never triggers that event.
      const base64Svg = btoa(unescape(encodeURIComponent(svgMarkup)));
      const url = "data:image/svg+xml;base64," + base64Svg;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, w, h).data;
        // Sample the background in a corner away from any text glyph.
        const bgIdx = (2 * w + 2) * 4;
        const bgSampleRgb = [imgData[bgIdx], imgData[bgIdx + 1], imgData[bgIdx + 2]];

        // Scan the marker's own bounding box (relative to the gutter)
        // for the darkest/lightest pixel — i.e. the actual glyph ink —
        // and count non-background pixels as a visibility proxy.
        const relLeft = Math.max(0, Math.floor(markerRect.left - gutterRect.left));
        const relTop = Math.max(0, Math.floor(markerRect.top - gutterRect.top));
        const relRight = Math.min(w, Math.ceil(markerRect.right - gutterRect.left));
        const relBottom = Math.min(h, Math.ceil(markerRect.bottom - gutterRect.top));

        let distinctTextPixelCount = 0;
        let extremeRgb = bgSampleRgb;
        let maxDiff = 0;
        for (let y = relTop; y < relBottom; y++) {
          for (let x = relLeft; x < relRight; x++) {
            const idx = (y * w + x) * 4;
            const px = [imgData[idx], imgData[idx + 1], imgData[idx + 2]];
            const diff =
              Math.abs(px[0] - bgSampleRgb[0]) +
              Math.abs(px[1] - bgSampleRgb[1]) +
              Math.abs(px[2] - bgSampleRgb[2]);
            if (diff > 30) distinctTextPixelCount++;
            if (diff > maxDiff) {
              maxDiff = diff;
              extremeRgb = px;
            }
          }
        }
        resolve({ bgSampleRgb, extremeRgb, distinctTextPixelCount });
      };
      img.onerror = () => resolve({ error: "SVG foreignObject render failed to load" });
      img.src = url;
    });
  });
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

test.describe("Gutter visual proof — real painted pixels, not just CSSOM (regression guard)", () => {
  // The gap this closes: measureContrastRatio() above proves the CSS
  // *declares* a WCAG-compliant color. It does NOT prove anything was
  // actually painted on screen. A zero-opacity rule, a clip-path, a
  // stacking-context bug, or a font that fails to load could all still
  // report a perfect getComputedStyle() color while the user sees
  // nothing — which is the exact complaint that triggered writing this
  // test ("I can't even see line numbers in the build"). These tests
  // rasterize the real DOM via canvas and inspect actual pixel bytes.
  for (const themeId of THEME_IDS) {
    test(`"${themeId}" theme: line numbers are actually painted (visible pixels, not just computed style)`, async ({ page }) => {
      await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
      await page.waitForSelector(".content", { state: "attached" });
      await openDoc(page, "line one\nline two\nline three\nline four\nline five");
      await applyTheme(page, themeId);
      await page.locator("#rawModeBtn").click();
      await expect(page.locator(".raw-editor-line-number").first()).toBeVisible();

      const result = await samplePaintedGutterPixels(page);
      expect(result, `theme "${themeId}": pixel sample returned no result`).toBeTruthy();
      expect(result.error, `theme "${themeId}": ${result.error || ""}`).toBeFalsy();

      // At 5 lines of text in a 1.6-line-height monospace font at
      // 0.9rem, a visible glyph set produces well over 50 distinct
      // (non-background) pixels. Zero or near-zero means the text is
      // present in the DOM but not actually rendering (the exact user
      // complaint this test exists to catch).
      expect(
        result.distinctTextPixelCount,
        `theme "${themeId}": only ${result.distinctTextPixelCount} non-background pixels found in the gutter — line numbers are not visibly painted`
      ).toBeGreaterThan(50);

      // Cross-check: the darkest/lightest actual painted pixel (the
      // real glyph ink) against the sampled background pixel must
      // ALSO clear WCAG AA — this is the same 4.5:1 bar, now measured
      // from rasterized bytes instead of getComputedStyle() strings.
      const ratio = pixelContrast(result.extremeRgb, result.bgSampleRgb);
      expect(
        ratio,
        `theme "${themeId}": rasterized pixel contrast ${ratio.toFixed(2)}:1 (glyph ink ${JSON.stringify(result.extremeRgb)} vs bg ${JSON.stringify(result.bgSampleRgb)})`
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  test("full-page screenshot artifact for human visual review: raw mode, obsidianite (default) theme, line numbers visible", async ({ page }) => {
    // Not a pass/fail assertion on pixel color (covered above) — this
    // attaches a PNG to the Playwright HTML report so a human reviewer
    // can see the gutter with their own eyes without launching the app,
    // addressing "I built it and can't see line numbers" directly.
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await openDoc(page, "line one\nline two\nline three\nline four\nline five\nline six\nline seven");
    await page.locator("#rawModeBtn").click();
    await expect(page.locator(".raw-editor-line-number").first()).toBeVisible();
    const gutter = page.locator(".raw-editor-gutter");
    await expect(gutter).toBeVisible();
    await test.info().attach("gutter-obsidianite-raw-mode.png", {
      body: await gutter.screenshot(),
      contentType: "image/png",
    });
    await test.info().attach("full-page-obsidianite-raw-mode.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });
});
