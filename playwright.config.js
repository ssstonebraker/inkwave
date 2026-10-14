// Playwright config for Inkwave's PyWebView frontend.
//
// Inkwave is a desktop app: Python (pywebview) hosts index.html and injects
// state via window.evaluate_js() calls to __applySettings/__applyWelcome,
// and the frontend calls back into window.pywebview.api (see js/api.js).
// There is no HTTP server in production. For browser-based E2E testing we
// serve the static frontend directory and inject a mock window.pywebview.api
// before any page script runs (see tests/e2e/fixtures/mock-pywebview.js),
// exercising the exact same __applySettings/__applyWelcome entry points
// app.py calls on a real launch.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Capped at 2 — not a performance tweak, a correctness fix. The dev
  // server below (`npx http-server`) is single-threaded; each page load
  // pulls ~23 JS modules + CSS/fonts from it. Root-caused across two
  // separate flakiness investigations: isolated single-test runs are
  // 100% reliable every time; full-suite runs at higher worker counts
  // intermittently fail (symptom: a click or keystroke appears to have
  // no effect, because the page hadn't fully finished loading/wiring
  // its event listeners when the test's first action fired — NOT a
  // dropped keystroke after the fact). Confirmed via Playwright trace
  // analysis (network timing, action logs) on multiple failures.
  // workers: 3 fixed the original flakiness at 71 total tests; adding
  // 15 more tests (86 total) reintroduced it until dropped to 2.
  // See also: -c<seconds> below (asset caching), which independently
  // reduces total server load per worker regardless of worker count.
  //
  // Re-verified at 170 total tests (this comment's revision): per-
  // invocation wall-clock time climbs when re-running `npx playwright
  // test` repeatedly in a loop (each invocation cold-starts and tears
  // down its own http-server, per webServer.reuseExistingServer only
  // reusing an ALREADY-running server). That rising time is an
  // artifact of repeated cold starts in a verification loop, not
  // actual test flakiness — confirmed via a SINGLE invocation with
  // `--repeat-each=3` (510 total test executions, one server
  // lifecycle): 510/510 passed, ~1.5 minutes. This is representative
  // of real usage (CI/a developer runs the suite once per invocation).
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    // -c60: cache static assets for 60s. The original -c-1 (disable
    // caching) meant every single test's page load re-fetched all
    // ~23 JS modules + CSS/fonts from the single-threaded dev server
    // with zero reuse across tests in the same worker process, adding
    // unnecessary load that made the worker-count flakiness worse.
    // Source files aren't edited mid-test-run, so a short cache window
    // is safe; 60s comfortably covers one full suite run (~10s) with
    // margin, while still picking up changes on the next test session.
    command: "npx http-server . -p 4173 -c60 --silent",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
