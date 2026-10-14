// Mock window.pywebview.api for Playwright E2E tests.
//
// Mirrors the exact return shapes of the real Python API in app.py:
//   - load_settings() -> flat dict, ALL VALUES ARE STRINGS (settings.js
//     line ~107 does `String(v)` before calling save_setting). This is
//     significant: "false" is a truthy JS string, so any JS code reading
//     this dict must compare `=== "false"` / `=== "true"` explicitly,
//     the same way the existing fullWidth handling in init.js does.
//   - get_welcome() -> {path, content} or null (Welcome.md read)
//   - save_setting(key, value) -> persists into the in-memory settingsStore
//     so subsequent load_settings() calls in the SAME test reflect writes,
//     matching real settings.json round-trip behavior across a relaunch
//     simulation (see reloadWithPersistedSettings in e2e-helpers.js).
//   - create_scratch_file() / list_scratch_files() / forget_scratch_file(path)
//     -> in-memory simulation of app.py's drafts.json registry + the
//     drafts directory, including the exact "Untitled N.md" collision
//     naming scheme from Api.create_file() (which create_scratch_file
//     delegates to). The registry (window.__inkwaveTestDraftsRegistry)
//     survives a simulated relaunch the same way settingsStore does,
//     so reload-on-launch (reloadScratchFiles) can be tested end to end.
//
// Must be installed via page.addInitScript() BEFORE index.html's module
// scripts run, since js/api.js reads window.pywebview synchronously and
// js/main.js calls initSettings()/whenApiReady() at module-eval time.
export function installMockPywebviewApi({ initialSettings, welcomeContent, initialDrafts }) {
  window.__inkwaveTestSettingsStore = { ...initialSettings };
  // { path: content } — mirrors the real on-disk drafts directory.
  window.__inkwaveTestDraftsRegistry = { ...(initialDrafts || {}) };

  function nextUntitledPath() {
    const existing = Object.keys(window.__inkwaveTestDraftsRegistry);
    if (!existing.includes("/mock/drafts/Untitled.md")) return "/mock/drafts/Untitled.md";
    for (let n = 1; n < 1000; n++) {
      const candidate = `/mock/drafts/Untitled ${n}.md`;
      if (!existing.includes(candidate)) return candidate;
    }
    return `/mock/drafts/Untitled ${Date.now()}.md`;
  }

  window.pywebview = {
    api: {
      load_settings() {
        // Real Python returns a fresh dict read from disk each call.
        return Promise.resolve({ ...window.__inkwaveTestSettingsStore });
      },
      save_setting(key, value) {
        window.__inkwaveTestSettingsStore[key] = String(value);
        return Promise.resolve({ ok: true });
      },
      get_welcome() {
        if (welcomeContent === null) return Promise.resolve(null);
        return Promise.resolve({
          path: "/mock/Welcome.md",
          content: welcomeContent,
        });
      },
      create_scratch_file() {
        const path = nextUntitledPath();
        window.__inkwaveTestDraftsRegistry[path] = "";
        return Promise.resolve({ path, content: "" });
      },
      list_scratch_files() {
        const files = Object.entries(window.__inkwaveTestDraftsRegistry).map(
          ([path, content]) => ({ path, content }),
        );
        return Promise.resolve({ files });
      },
      forget_scratch_file(path) {
        delete window.__inkwaveTestDraftsRegistry[path];
        return Promise.resolve({ ok: true });
      },
      write_file(path, content) {
        if (Object.prototype.hasOwnProperty.call(window.__inkwaveTestDraftsRegistry, path)) {
          window.__inkwaveTestDraftsRegistry[path] = content;
        }
        return Promise.resolve({ path });
      },
      delete_file(path) {
        // Real app.py contract is {success: bool, error?} — NOT {ok}.
        // (save_setting/save_provider_api_key use {ok}; delete_file and
        // open_path use {success} — two different shapes in the real
        // backend, both mirrored exactly here rather than normalized,
        // since normalizing would make the mock lie about what the
        // real app actually returns.)
        delete window.__inkwaveTestDraftsRegistry[path];
        return Promise.resolve({ success: true });
      },
      save_as(suggestedName) {
        const path = "/mock/saved/" + (suggestedName || "Untitled.md");
        return Promise.resolve({ path });
      },
      // Native file/folder picker dialogs — can't be driven from Playwright
      // (OS-level dialog), so default to "user cancelled" (null), matching
      // what the real pywebview create_file_dialog() returns on Cancel.
      // Override via window.__inkwaveMockApiOverrides.open_file/open_folder
      // in a specific test to simulate "user picked X".
      open_file() {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.open_file;
        if (override) return Promise.resolve(override());
        return Promise.resolve(null);
      },
      open_folder() {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.open_folder;
        if (override) return Promise.resolve(override());
        return Promise.resolve(null);
      },
      list_dir(dirPath) {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.list_dir;
        if (override) return Promise.resolve(override(dirPath));
        return Promise.resolve([]);
      },
      read_file(path) {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.read_file;
        if (override) return Promise.resolve(override(path));
        return Promise.resolve({ path, content: "" });
      },
      // ── AI provider key management — in-memory flags only, mirrors
      // app.py's get_provider_api_key_status (cached settings flag, never
      // reads a real keychain) and save/delete_provider_api_key (which in
      // the real app touch the OS keychain via the `keyring` package).
      save_provider_api_key(provider, key) {
        if (!key) return Promise.resolve({ ok: false, error: "Empty key" });
        window.__inkwaveTestKeyFlags = window.__inkwaveTestKeyFlags || {};
        window.__inkwaveTestKeyFlags[provider] = true;
        return Promise.resolve({ ok: true });
      },
      get_provider_api_key_status(provider) {
        window.__inkwaveTestKeyFlags = window.__inkwaveTestKeyFlags || {};
        return Promise.resolve({ has_key: !!window.__inkwaveTestKeyFlags[provider] });
      },
      delete_provider_api_key(provider) {
        window.__inkwaveTestKeyFlags = window.__inkwaveTestKeyFlags || {};
        window.__inkwaveTestKeyFlags[provider] = false;
        return Promise.resolve({ ok: true });
      },
      list_ollama_models() {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.list_ollama_models;
        if (override) return Promise.resolve(override());
        return Promise.resolve({ models: [] });
      },
      // Minimal stubs for API surface area main.js/init.js touch at
      // startup so unrelated code paths don't throw.
      toggle_fullscreen() { return Promise.resolve(null); },
    },
  };

  // window.pywebview.state.loaded fires in real pywebview once the JS
  // bridge is ready; main.js's whenApiReady() polls for window.pywebview.
}
