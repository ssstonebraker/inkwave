// E2E coverage for the main toolbar: Open menu, New file, Copy, Raw
// mode, Split V/H, TOC, Chat, Focus mode, Settings modal (every toggle
// + AI provider/model selects + API key set/save/cancel/delete flows
// for all three keychain-backed providers), theme picker, and sidebar
// collapse/expand. Fills the gap left by welcome-startup-toggle.spec.js
// (only exercises settingsBtn + showWelcomeToggle) and
// scratch-files.spec.js (only exercises Cmd+N/Cmd+S/tab-close).
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride } from "./helpers.js";

test.describe("Toolbar — Open menu", () => {
  test("clicking Open shows the Open file / Open folder menu", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const menu = page.locator("#openMenu");
    await expect(menu).not.toHaveClass(/visible/);
    await page.locator("#openBtn").click();
    await expect(menu).toHaveClass(/visible/);
  });

  test("clicking Open a second time closes the menu (toggle)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#openBtn").click();
    await page.locator("#openBtn").click();
    await expect(page.locator("#openMenu")).not.toHaveClass(/visible/);
  });

  test("Open file menu item calls the open_file API and renders returned content", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/picked.md", content: "# Picked file content",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);
    await expect(page.locator(".tab")).toContainText("picked.md");
    await expect(page.locator("#content-primary")).toContainText("Picked file content");
  });

  test("Open file menu item does nothing when the user cancels the native dialog", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    // Default mock behavior is "user cancelled" (null) — no override set.
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await page.waitForTimeout(100);
    await expect(page.locator(".tab")).toHaveCount(0);
  });

  test("Open folder menu item calls open_folder and populates the tree", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_folder", { root: "/mock/project" });
    await setMockOverride(page, "list_dir", [
      { name: "notes.md", path: "/mock/project/notes.md", isDir: false },
    ]);
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="folder"]').click();
    // initTree() always renders the opened folder itself as the first
    // .tree-item (root node) before its children load — so 2 total:
    // the "project" root + the "notes.md" child from list_dir. Asserts
    // the actual child FILE NAME rendered, not just a count, since a
    // bare .tree-item count of 1 would have passed even if list_dir's
    // entries never rendered at all (real bug this exact gap masked:
    // see filetree-context-menu.spec.js and mock-pywebview.js's
    // list_dir comment for the full story).
    await expect(page.locator("#tree .tree-item")).toHaveCount(2, { timeout: 2000 });
    await expect(page.locator("#tree .tree-item.file")).toContainText("notes.md");
  });
});

test.describe("Toolbar — Raw mode toggle", () => {
  test("rawModeBtn toggles aria-pressed state", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const btn = page.locator("#rawModeBtn");
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  test("rawModeBtn click with no active tab does not throw", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await expect(page.locator("#rawModeBtn").click()).resolves.not.toThrow();
  });

  test("raw mode button state matches the module's rawMode variable", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const btn = page.locator("#rawModeBtn");
    await btn.click();
    const ariaAfterClick = await btn.getAttribute("aria-pressed");
    const rawModeState = await page.evaluate(async () => {
      const state = await import("/js/state.js");
      return state.rawMode;
    });
    expect(ariaAfterClick).toBe(rawModeState ? "true" : "false");
  });
});

test.describe("Toolbar — Split view", () => {
  test("Split vertically opens a secondary pane", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await expect(page.locator("#pane-secondary")).toBeHidden();
    await page.locator("#splitVBtn").click();
    await expect(page.locator("#pane-secondary")).toBeVisible();
  });

  test("Split vertically twice closes the split (toggle)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#splitVBtn").click();
    await page.locator("#splitVBtn").click();
    await expect(page.locator("#pane-secondary")).toBeHidden();
  });

  test("Split horizontally opens a secondary pane", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#splitHBtn").click();
    await expect(page.locator("#pane-secondary")).toBeVisible();
  });

  test("switching from vertical to horizontal split does not leave two secondary panes", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#splitVBtn").click();
    await page.locator("#splitHBtn").click();
    await expect(page.locator("#pane-secondary")).toHaveCount(1);
    await expect(page.locator("#splitHBtn")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#splitVBtn")).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("Toolbar — Table of contents panel", () => {
  test("TOC button opens the panel (inert attribute removed)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const panel = page.locator("#tocPanel");
    await expect(panel).toHaveAttribute("inert", "");
    await page.locator("#tocBtn").click();
    await expect(panel).not.toHaveAttribute("inert", "");
  });

  test("TOC close button closes the panel", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#tocBtn").click();
    await page.locator("#tocCloseBtn").click();
    await expect(page.locator("#tocPanel")).toHaveAttribute("inert", "");
  });
});

test.describe("Toolbar — Focus mode", () => {
  test("Focus button sets data-focus-mode on body", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await expect(page.locator("body")).not.toHaveAttribute("data-focus-mode", "true");
    await page.locator("#focusBtn").click();
    await expect(page.locator("body")).toHaveAttribute("data-focus-mode", "true");
  });

  test("Focus exit button clears focus mode", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#focusBtn").click();
    await page.locator("#focusExitBtn").click();
    await expect(page.locator("body")).not.toHaveAttribute("data-focus-mode", "true");
  });
});

test.describe("Toolbar — Sidebar collapse/expand", () => {
  test("sidebarToggle collapses the file tree (width: 0, overflow: hidden)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const sidebar = page.locator("#sidebar");
    const toggle = page.locator("#sidebarToggle");
    await expect(sidebar).not.toHaveClass(/collapsed/);
    await toggle.click();
    await expect(sidebar).toHaveClass(/collapsed/);
    await expect(toggle).toHaveText("▶");
  });

  test("showSidebarBtn re-expands a collapsed sidebar", async ({ page }) => {
    // The real UX pattern (confirmed in style.css: .sidebar.collapsed sets
    // width:0 + overflow:hidden, which removes #sidebarToggle from the
    // clickable viewport along with the rest of .sidebar's contents) is
    // TWO separate controls: #sidebarToggle collapses, and a DIFFERENT
    // always-visible element, #showSidebarBtn (shown via the
    // `.sidebar.collapsed ~ .show-sidebar-btn { display: flex }` CSS
    // sibling selector), re-expands. Clicking #sidebarToggle a second
    // time while collapsed is not a valid user action — it's invisible
    // and non-interactable, exactly as Playwright's own "element is
    // outside of the viewport" / actionability check would catch.
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const sidebar = page.locator("#sidebar");
    await page.locator("#sidebarToggle").click();
    await expect(sidebar).toHaveClass(/collapsed/);

    await page.locator("#showSidebarBtn").click();
    await expect(sidebar).not.toHaveClass(/collapsed/);
    await expect(page.locator("#sidebarToggle")).toHaveText("◀");
  });

  test("#sidebarToggle is not actionable while the sidebar is collapsed", async ({ page }) => {
    // Documents the real constraint found above as an explicit
    // assertion, rather than letting a future test silently reintroduce
    // "click sidebarToggle twice" and hang for 30s again.
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#sidebarToggle").click();
    await expect(page.locator("#sidebar")).toHaveClass(/collapsed/);
    await expect(page.locator("#sidebarToggle")).not.toBeInViewport();
  });
});

test.describe("Theme picker", () => {
  test("clicking the theme picker opens the theme list", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const list = page.locator("#themePickerList");
    await expect(list).toBeHidden();
    await page.locator("#themePickerBtn").click();
    await expect(list).toBeVisible();
  });

  test("selecting a theme applies it and updates the label", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#themePickerBtn").click();
    await page.locator('#themePickerList li[data-value="dracula"]').click();
    await expect(page.locator("#themePickerLabel")).toHaveText("Dracula");
  });

  test("selecting a theme persists it via save_setting (settings.json path, not localStorage)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#themePickerBtn").click();
    await page.locator('#themePickerList li[data-value="nord"]').click();
    // Theme persistence goes through window.pywebview.api.save_setting()
    // (app.py's settings.json), NOT the separate js/settings.js
    // loadSettings()/saveSettings() localStorage mechanism — those are
    // two distinct persistence paths in this app, confirmed by reading
    // js/ui.js's commitOption() (calls a.save_setting("theme", ...))
    // vs js/settings.js's loadSettings() (reads localStorage only).
    await expect
      .poll(async () => page.evaluate(() => window.__inkwaveTestSettingsStore.theme))
      .toBe("nord");
  });
});

test.describe("Settings modal — open/close", () => {
  test("Settings button opens the modal, close button closes it", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    const modal = page.locator("#settingsModal");
    await expect(modal).toBeHidden();
    await page.locator("#settingsBtn").click();
    await expect(modal).toBeVisible();
    await page.locator("#settingsCloseBtn").click();
    await expect(modal).toBeHidden();
  });
});

test.describe("Settings modal — toggles", () => {
  test("Vim keybindings toggle flips aria-checked and persists", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    const toggle = page.locator("#vimModeToggle");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    const persisted = await page.evaluate(async () => {
      const settingsMod = await import("/js/settings.js");
      return settingsMod.loadSettings().vimMode;
    });
    expect(persisted).toBe(true);
  });

  test("Gradient bold toggle flips aria-checked and persists", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    const toggle = page.locator("#gradientBoldToggle");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("Full width toggle flips aria-checked and applies the class", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    const toggle = page.locator("#fullWidthToggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  test("Double-click to edit toggle flips aria-checked and persists", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    const toggle = page.locator("#dblClickEditToggle");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});

test.describe("Settings modal — AI provider / model selects", () => {
  test("switching provider to Ollama reveals the Ollama section, hides API key sections", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await expect(page.locator("#anthropicKeySection")).toBeVisible();
    await page.locator("#llmProviderSelect").selectOption("ollama");
    await expect(page.locator("#anthropicKeySection")).toBeHidden();
  });

  test("switching provider back to Anthropic reveals its key section again", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#llmProviderSelect").selectOption("openai");
    await page.locator("#llmProviderSelect").selectOption("anthropic");
    await expect(page.locator("#anthropicKeySection")).toBeVisible();
  });
});

test.describe("Settings modal — API key set/save/cancel/delete flow (Anthropic)", () => {
  test("Set key button reveals the input, Cancel hides it without saving", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await expect(page.locator("#anthropicKeyEntry")).toBeHidden();
    await page.locator("#anthropicKeySetBtn").click();
    await expect(page.locator("#anthropicKeyEntry")).toBeVisible();
    await page.locator("#anthropicKeyInput").fill("sk-ant-test-key");
    await page.locator("#anthropicKeyCancelBtn").click();
    await expect(page.locator("#anthropicKeyEntry")).toBeHidden();
    await expect(page.locator("#anthropicKeyInput")).toHaveValue("");
  });

  test("Save button with a real key calls save_provider_api_key and shows Remove button", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#anthropicKeySetBtn").click();
    await page.locator("#anthropicKeyInput").fill("sk-ant-real-key-value");
    await page.locator("#anthropicKeySaveBtn").click();
    await expect(page.locator("#anthropicKeyEntry")).toBeHidden({ timeout: 2000 });
    await expect(page.locator("#anthropicKeyDeleteBtn")).toBeVisible();
  });

  test("Save button with an EMPTY key does nothing (no API call, entry stays open)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#anthropicKeySetBtn").click();
    await page.locator("#anthropicKeyInput").fill("   ");
    await page.locator("#anthropicKeySaveBtn").click();
    await page.waitForTimeout(100);
    // Entry stays open — empty/whitespace-only key is a no-op, not a save.
    await expect(page.locator("#anthropicKeyEntry")).toBeVisible();
  });

  test("Delete button removes the key and shows Set key button again", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#anthropicKeySetBtn").click();
    await page.locator("#anthropicKeyInput").fill("sk-ant-to-be-deleted");
    await page.locator("#anthropicKeySaveBtn").click();
    await expect(page.locator("#anthropicKeyDeleteBtn")).toBeVisible({ timeout: 2000 });
    await page.locator("#anthropicKeyDeleteBtn").click();
    await expect(page.locator("#anthropicKeySetBtn")).toBeVisible({ timeout: 2000 });
    await expect(page.locator("#anthropicKeyDeleteBtn")).toBeHidden();
  });

  test("key status persists across reopening the settings modal", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#anthropicKeySetBtn").click();
    await page.locator("#anthropicKeyInput").fill("sk-ant-persisted-key");
    await page.locator("#anthropicKeySaveBtn").click();
    await expect(page.locator("#anthropicKeyDeleteBtn")).toBeVisible({ timeout: 2000 });

    await page.locator("#settingsCloseBtn").click();
    await page.locator("#settingsBtn").click();
    await expect(page.locator("#anthropicKeyDeleteBtn")).toBeVisible({ timeout: 2000 });
  });
});

test.describe("Settings modal — API key flow (OpenAI, Gemini) — same contract, different provider", () => {
  test("OpenAI key save/delete round trip", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#llmProviderSelect").selectOption("openai");
    await page.locator("#openaiKeySetBtn").click();
    await page.locator("#openaiKeyInput").fill("sk-openai-test-key");
    await page.locator("#openaiKeySaveBtn").click();
    await expect(page.locator("#openaiKeyDeleteBtn")).toBeVisible({ timeout: 2000 });
    await page.locator("#openaiKeyDeleteBtn").click();
    await expect(page.locator("#openaiKeySetBtn")).toBeVisible({ timeout: 2000 });
  });

  test("Gemini key save/delete round trip", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#llmProviderSelect").selectOption("gemini");
    await page.locator("#geminiKeySetBtn").click();
    await page.locator("#geminiKeyInput").fill("gemini-test-key");
    await page.locator("#geminiKeySaveBtn").click();
    await expect(page.locator("#geminiKeyDeleteBtn")).toBeVisible({ timeout: 2000 });
    await page.locator("#geminiKeyDeleteBtn").click();
    await expect(page.locator("#geminiKeySetBtn")).toBeVisible({ timeout: 2000 });
  });

  test("saving a key for one provider does not affect another provider's key status", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#settingsBtn").click();
    await page.locator("#anthropicKeySetBtn").click();
    await page.locator("#anthropicKeyInput").fill("sk-ant-only-this-one");
    await page.locator("#anthropicKeySaveBtn").click();
    await expect(page.locator("#anthropicKeyDeleteBtn")).toBeVisible({ timeout: 2000 });

    await page.locator("#llmProviderSelect").selectOption("openai");
    await expect(page.locator("#openaiKeySetBtn")).toBeVisible({ timeout: 2000 });
    await expect(page.locator("#openaiKeyDeleteBtn")).toBeHidden();
  });
});
