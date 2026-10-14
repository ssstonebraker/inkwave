// E2E coverage for the AI chat panel: sending a message, the streaming
// response contract (window.__chatChunk/__chatDone/__chatError, which
// app.py's real chat() calls from a background thread via
// window.evaluate_js — see app.py's _push_js), no-API-key error
// messaging, Enter-to-send/Shift+Enter-newline, context chips, and the
// file-change diff accept/reject flow (js/diff-utils.js's
// <file-change path="...">...</file-change> contract).
import { test, expect } from "@playwright/test";
import { gotoApp, setMockOverride } from "./helpers.js";

async function openChatAndSend(page, text) {
  await page.locator("#chatBtn").click();
  await page.locator("#chatInput").fill(text);
  await page.locator("#chatSendBtn").click();
}

/**
 * chat() overrides need to call window.__chatChunk/__chatDone/__chatError
 * as side effects, which setMockOverride() can't express (it JSON-
 * serializes a static return VALUE across the Playwright<->browser
 * bridge, and functions aren't serializable). Install a page-side
 * function body directly instead.
 */
async function setChatOverride(page, bodySource) {
  await page.evaluate((src) => {
    window.__inkwaveMockApiOverrides = window.__inkwaveMockApiOverrides || {};
    // eslint-disable-next-line no-new-func
    window.__inkwaveMockApiOverrides.chat = new Function(src);
  }, bodySource);
}

test.describe("AI chat — sending a message", () => {
  test("sending a message with no API key configured shows the no_api_key error", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    // Default mock chat() behavior is {ok: false, error: "no_api_key"} — no override needed.
    await openChatAndSend(page, "Hello AI");
    await expect(page.locator(".chat-message-user")).toContainText("Hello AI");
    await expect(page.locator(".chat-error")).toContainText("No API key set");
  });

  test("sending a message streams chunks into the assistant bubble", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setChatOverride(page, `
      window.__chatChunk("Hello");
      window.__chatChunk(" there!");
      window.__chatDone();
      return { ok: true };
    `);
    await openChatAndSend(page, "Say hi");
    await expect(page.locator(".chat-message-assistant").last()).toContainText("Hello there!", { timeout: 2000 });
  });

  test("a chat error from the backend (not no_api_key) renders the raw error text", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "chat", { ok: false, error: "rate_limited" });
    await openChatAndSend(page, "Hi");
    await expect(page.locator(".chat-error")).toContainText("rate_limited");
  });

  test("__chatError global callback (mid-stream failure) shows an error in the bubble", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setChatOverride(page, `
      window.__chatChunk("Partial respon");
      window.__chatError("Connection lost mid-stream");
      return { ok: true };
    `);
    await openChatAndSend(page, "Hi");
    await expect(page.locator(".chat-error")).toContainText("Connection lost mid-stream");
  });

  test("send button is disabled while input is empty, enabled once text is typed", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#chatBtn").click();
    await expect(page.locator("#chatSendBtn")).toBeDisabled();
    await page.locator("#chatInput").fill("something");
    await expect(page.locator("#chatSendBtn")).toBeEnabled();
    await page.locator("#chatInput").fill("");
    await expect(page.locator("#chatSendBtn")).toBeDisabled();
  });

  test("sending an empty/whitespace-only message does nothing", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#chatBtn").click();
    await page.locator("#chatInput").fill("   ");
    // Button should be disabled, so force a direct call to prove the
    // app's own guard (not just the disabled attribute) rejects it too.
    await page.locator("#chatSendBtn").click({ force: true });
    await page.waitForTimeout(100);
    await expect(page.locator(".chat-message-user")).toHaveCount(0);
  });

  test("Enter sends the message, Shift+Enter inserts a newline instead", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#chatBtn").click();
    await page.locator("#chatInput").fill("line one");
    await page.locator("#chatInput").press("Shift+Enter");
    await page.locator("#chatInput").type("line two");
    // Shift+Enter must NOT have sent the message.
    await expect(page.locator(".chat-message-user")).toHaveCount(0);
    await expect(page.locator("#chatInput")).toHaveValue("line one\nline two");

    await page.locator("#chatInput").press("Enter");
    await expect(page.locator(".chat-message-user")).toHaveCount(1);
    await expect(page.locator(".chat-message-user")).toContainText("line one");
    await expect(page.locator(".chat-message-user")).toContainText("line two");
  });

  test("input and send button are disabled while a response is streaming (before __chatDone fires)", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setChatOverride(page, `
      // Deliberately do NOT call __chatDone — simulates a still-streaming response.
      window.__chatChunk("still typing...");
      return { ok: true };
    `);
    await openChatAndSend(page, "Hi");
    await expect(page.locator("#chatInput")).toBeDisabled({ timeout: 2000 });
    await expect(page.locator("#chatSendBtn")).toBeDisabled();
  });
});

test.describe("AI chat — panel chrome", () => {
  test("chatCloseBtn closes the panel", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#chatBtn").click();
    await expect(page.locator("#chatPanel")).toHaveClass(/visible/);
    await page.locator("#chatCloseBtn").click();
    await expect(page.locator("#chatPanel")).not.toHaveClass(/visible/);
    await expect(page.locator("#chatBtn")).toHaveAttribute("aria-pressed", "false");
  });

  test("context chips show 'No files open' when nothing is open", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await page.locator("#chatBtn").click();
    await expect(page.locator("#chatChips")).toContainText("No files open");
  });

  test("context chips show each open tab's filename", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/report.md", content: "# Report",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    await page.locator("#chatBtn").click();
    await expect(page.locator("#chatChips")).toContainText("report.md");
  });
});

test.describe("AI chat — file-change diff accept/reject", () => {
  test("a response containing a file-change tag shows the diff viewer", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/doc.md", content: "old line one\nold line two",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    await setChatOverride(page, `
      window.__chatChunk('<file-change path="/mock/notes/doc.md">new line one\\nnew line two</file-change>');
      window.__chatDone();
      return { ok: true };
    `);
    await openChatAndSend(page, "Update the doc");
    await expect(page.locator("#chatDiffViewer")).toBeVisible({ timeout: 2000 });
    await expect(page.locator("#chatDiffPath")).toHaveText("doc.md");
  });

  test("Accept writes the file and shows a system confirmation message", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/doc.md", content: "old content",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    let writtenContent = null;
    await page.evaluate(() => {
      window.__inkwaveMockApiOverrides = window.__inkwaveMockApiOverrides || {};
      window.__inkwaveMockApiOverrides.write_file = (p, c) => { window.__inkwaveLastWrite = { path: p, content: c }; return { path: p }; };
      window.__inkwaveMockApiOverrides.chat = () => {
        window.__chatChunk('<file-change path="/mock/notes/doc.md">brand new content</file-change>');
        window.__chatDone();
        return { ok: true };
      };
    });
    await openChatAndSend(page, "Update it");
    await expect(page.locator("#chatDiffViewer")).toBeVisible({ timeout: 2000 });
    await page.locator("#chatDiffAccept").click();

    await expect(page.locator(".chat-message-system")).toContainText("Accepted changes");
    writtenContent = await page.evaluate(() => window.__inkwaveLastWrite);
    expect(writtenContent).toEqual({ path: "/mock/notes/doc.md", content: "brand new content" });
    await expect(page.locator("#chatDiffViewer")).toBeHidden();
    // The already-open tab's content must reflect the accepted change.
    await expect(page.locator("#content-primary")).toContainText("brand new content");
  });

  test("Reject does NOT write the file, shows a rejection message", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setMockOverride(page, "open_file", {
      root: "/mock/notes", path: "/mock/notes/doc.md", content: "original content",
    });
    await page.locator("#openBtn").click();
    await page.locator('#openMenu button[data-action="file"]').click();
    await expect(page.locator(".tab")).toHaveCount(1);

    let writeCalled = false;
    await page.evaluate(() => {
      window.__inkwaveMockApiOverrides = window.__inkwaveMockApiOverrides || {};
      window.__inkwaveMockApiOverrides.write_file = () => { window.__inkwaveWriteCalled = true; return {}; };
      window.__inkwaveMockApiOverrides.chat = () => {
        window.__chatChunk('<file-change path="/mock/notes/doc.md">rejected content</file-change>');
        window.__chatDone();
        return { ok: true };
      };
    });
    await openChatAndSend(page, "Update it");
    await expect(page.locator("#chatDiffViewer")).toBeVisible({ timeout: 2000 });
    await page.locator("#chatDiffReject").click();

    await expect(page.locator(".chat-message-system")).toContainText("Rejected changes");
    writeCalled = await page.evaluate(() => !!window.__inkwaveWriteCalled);
    expect(writeCalled).toBe(false);
    await expect(page.locator("#chatDiffViewer")).toBeHidden();
    await expect(page.locator("#content-primary")).toContainText("original content");
  });

  test("multiple file-change proposals are navigated one at a time", async ({ page }) => {
    await gotoApp(page, { initialSettings: { showWelcomeOnStartup: "false" } });
    await page.waitForSelector(".content", { state: "attached" });
    await setChatOverride(page, `
      window.__chatChunk(
        '<file-change path="/mock/a.md">content a</file-change>' +
        '<file-change path="/mock/b.md">content b</file-change>'
      );
      window.__chatDone();
      return { ok: true };
    `);
    await openChatAndSend(page, "Update both");
    await expect(page.locator("#chatDiffViewer")).toBeVisible({ timeout: 2000 });
    await expect(page.locator("#chatDiffNav")).toHaveText("Change 1 of 2");
    await expect(page.locator("#chatDiffPath")).toHaveText("a.md");

    await page.locator("#chatDiffAccept").click();
    await expect(page.locator("#chatDiffPath")).toHaveText("b.md");
    await expect(page.locator("#chatDiffNav")).toHaveText("Change 2 of 2");

    await page.locator("#chatDiffReject").click();
    await expect(page.locator("#chatDiffViewer")).toBeHidden();
  });
});
