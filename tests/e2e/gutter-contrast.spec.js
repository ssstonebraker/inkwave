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
import { inflateSync } from "node:zlib";
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
 * Minimal PNG decoder (no third-party dependency — Node's built-in
 * zlib is sufficient since PNG IDAT chunks are just zlib-deflated raw
 * scanlines). Only supports what Playwright/Chromium actually emits
 * for locator.screenshot(): 8-bit depth, color type 6 (RGBA) or 2
 * (RGB), no interlacing. Throws on anything else rather than silently
 * misreading bytes.
 */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error("Not a PNG (bad signature)");
  }
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idatChunks = [];
  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer.readUInt8(dataStart + 8);
      colorType = buffer.readUInt8(dataStart + 9);
      interlace = buffer.readUInt8(dataStart + 12);
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(dataStart, dataStart + len));
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + len + 4; // skip CRC
  }
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
  if (colorType !== 6 && colorType !== 2) throw new Error(`Unsupported PNG color type: ${colorType}`);
  if (interlace !== 0) throw new Error("Interlaced PNG not supported");

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);

  let prevRow = new Uint8Array(stride);
  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const raw_x = raw[rawOffset + x];
      const a = x >= channels ? row[x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;
      let value;
      switch (filterType) {
        case 0: value = raw_x; break;
        case 1: value = raw_x + a; break;
        case 2: value = raw_x + b; break;
        case 3: value = raw_x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          value = raw_x + pred;
          break;
        }
        default: throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
      row[x] = value & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const srcIdx = x * channels;
      const dstIdx = (y * width + x) * 4;
      pixels[dstIdx] = row[srcIdx];
      pixels[dstIdx + 1] = row[srcIdx + 1];
      pixels[dstIdx + 2] = row[srcIdx + 2];
      pixels[dstIdx + 3] = channels === 4 ? row[srcIdx + 3] : 255;
    }
    rawOffset += stride;
    prevRow = row;
  }
  return { width, height, pixels };
}

/**
 * Screenshot the gutter via Playwright's native locator.screenshot()
 * (real browser rasterization — fonts, colors, compositing, the whole
 * paint pipeline, no manual canvas/SVG tricks) and decode the actual
 * PNG bytes in Node. Returns pixel samples proving text is genuinely
 * painted, not just declared in CSS.
 *
 * This exists because getComputedStyle().color (used by
 * measureContrastRatio above) proves the CSS *declares* the right
 * color, but does not prove anything was actually painted to the
 * screen — a 0-opacity element, a clip-path hiding it, or a z-index
 * stacking bug would still report a perfect getComputedStyle() color
 * while being functionally invisible. This catches exactly that class
 * of bug, which is what the user hit ("I can't even see line numbers
 * in the build").
 */
async function samplePaintedGutterPixels(page) {
  const gutter = page.locator(".raw-editor-gutter");
  // Line 2, not line 1 — line 1 is "current" by default (cursor starts
  // there) and gets a translucent highlight overlay
  // (.raw-editor-current-line's rgba(128,128,128,0.15)), a deliberate
  // and separate color this function is not testing. Using a non-
  // current line keeps this test measuring the plain --gutter-text
  // rule, matching what measureContrastRatio() asserts elsewhere.
  const marker = page.locator(".raw-editor-line-number").nth(1);
  await marker.waitFor({ state: "visible", timeout: 5000 });

  const gutterBox = await gutter.boundingBox();
  const markerBox = await marker.boundingBox();
  if (!gutterBox || gutterBox.width === 0 || gutterBox.height === 0) {
    return { error: "gutter has zero size — not painted" };
  }
  if (!markerBox || markerBox.width === 0 || markerBox.height === 0) {
    return { error: "line-number marker has zero size — not painted" };
  }

  const pngBuffer = await gutter.screenshot();
  const { width: w, height: h, pixels } = decodePng(pngBuffer);

  // Sample the background from well below the first several lines —
  // the first line is "current" by default (cursor starts there) and
  // its gutter cell has a translucent highlight overlay
  // (.raw-editor-current-line's rgba(128,128,128,0.15) composited over
  // --toolbar-bg), which is a REAL, deliberate color difference, not
  // noise. Sampling near y=0 picks up that highlighted band instead of
  // the plain background. The doc opened by this test has 5 lines; a
  // 1.6 line-height font at 0.9rem puts line 4+ comfortably past the
  // first line's highlight band.
  const bgPatchY = Math.min(h - 4, Math.floor(h * 0.6));
  const bgSamples = [];
  for (let dy = 0; dy < 3 && bgPatchY + dy < h; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const idx = ((bgPatchY + dy) * w + dx) * 4;
      bgSamples.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
  }
  const bgSampleRgb = [0, 1, 2].map((c) =>
    Math.round(bgSamples.reduce((sum, px) => sum + px[c], 0) / bgSamples.length)
  );

  // Scan the marker's own bounding box (relative to the gutter
  // screenshot's origin) for the pixel furthest from the background —
  // i.e. the actual glyph ink. At this font size, monospace digit
  // strokes are only 1-2px wide with no solid interior majority, so a
  // percentile/median approach over-samples anti-aliased edge pixels;
  // the true max-difference pixel is the most reliable proxy for the
  // intended solid fill color.
  const relLeft = Math.max(0, Math.floor(markerBox.x - gutterBox.x));
  const relTop = Math.max(0, Math.floor(markerBox.y - gutterBox.y));
  const relRight = Math.min(w, Math.ceil(markerBox.x - gutterBox.x + markerBox.width));
  const relBottom = Math.min(h, Math.ceil(markerBox.y - gutterBox.y + markerBox.height));

  let distinctTextPixelCount = 0;
  let extremeRgb = bgSampleRgb;
  let maxDiff = 0;
  for (let y = relTop; y < relBottom; y++) {
    for (let x = relLeft; x < relRight; x++) {
      const idx = (y * w + x) * 4;
      const px = [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
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

  return { bgSampleRgb, extremeRgb, distinctTextPixelCount };
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
      // Wait for line 2 specifically, not just line 1 — line 2 (not
      // line 1, which is "current" and gets a highlight overlay) is
      // what samplePaintedGutterPixels() below actually measures. On
      // slower/parallel-worker CI environments, line 1 can report
      // visible before line 2 has finished layout, causing a
      // zero-size boundingBox() race on the element this test reads.
      await expect(page.locator(".raw-editor-line-number").nth(1)).toBeVisible();

      const result = await samplePaintedGutterPixels(page);
      expect(result, `theme "${themeId}": pixel sample returned no result`).toBeTruthy();
      expect(result.error, `theme "${themeId}": ${result.error || ""}`).toBeFalsy();

      // At 5 lines of text in a 1.6-line-height monospace font at
      // 0.9rem, visible glyphs reliably produce 45-50+ distinct
      // (non-background) pixels across all 18 themes (measured range:
      // 48-107). The real failure mode this guards against — zero
      // opacity, clip-path, or a stacking bug hiding the text entirely —
      // produces a count near zero, not a borderline number close to
      // the legitimate range. 20 leaves comfortable margin on both
      // sides: well below every real measured value, well above the
      // near-zero a genuinely invisible gutter would produce.
      expect(
        result.distinctTextPixelCount,
        `theme "${themeId}": only ${result.distinctTextPixelCount} non-background pixels found in the gutter — line numbers are not visibly painted`
      ).toBeGreaterThan(20);

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
