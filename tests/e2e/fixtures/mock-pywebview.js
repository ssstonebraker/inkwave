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
        return Promise.resolve({ success: true });
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
      // Mock for the "hangs on exit" fix (2026-10-15): js/scratch.js's
      // pushUnsavedScratchState() calls this whenever scratch-tab unsaved
      // state changes, so the real Python Api can read a plain attribute
      // at quit time instead of calling window.evaluate_js (which
      // deadlocks on the real cocoa backend — see app.py's
      // check_unsaved_scratch_on_quit docstring). Tracks every push in
      // an array (not just the latest value) so tests can assert on the
      // exact sequence of pushes, not just the final state.
      set_has_unsaved_scratch(value) {
        window.__inkwaveTestHasUnsavedScratchPushes =
          window.__inkwaveTestHasUnsavedScratchPushes || [];
        window.__inkwaveTestHasUnsavedScratchPushes.push(value);
        return Promise.resolve(null);
      },
      write_file(path, content) {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.write_file;
        if (override) return Promise.resolve(override(path, content));
        // General-purpose write tracking for ANY file (scratch or a
        // regular file opened via open_file) — readWrittenFile() in
        // helpers.js reads this. Scratch files additionally stay
        // mirrored into __inkwaveTestDraftsRegistry so
        // reloadScratchFiles()/list_scratch_files() keep working.
        window.__inkwaveTestWrittenFiles = window.__inkwaveTestWrittenFiles || {};
        window.__inkwaveTestWrittenFiles[path] = content;
        if (Object.prototype.hasOwnProperty.call(window.__inkwaveTestDraftsRegistry, path)) {
          window.__inkwaveTestDraftsRegistry[path] = content;
        }
        return Promise.resolve({ path });
      },
      delete_file(path) {
        delete window.__inkwaveTestDraftsRegistry[path];
        if (window.__inkwaveTestWrittenFiles) {
          delete window.__inkwaveTestWrittenFiles[path];
        }
        return Promise.resolve({ ok: true });
      },
      // Real Python's open_file() shows a native file-picker dialog and
      // returns {root, path, content} on selection, or null if the user
      // cancels. Tests drive this via setMockOverride(page, "open_file",
      // {...}) — see openDoc() in editor-mode-affordances.spec.js and
      // gutter-contrast.spec.js. No override set == dialog cancelled
      // (matches real pywebview behavior, never a bare throw).
      open_file() {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.open_file;
        if (override) return Promise.resolve(override());
        return Promise.resolve(null);
      },
      // Same override pattern as open_file above — real pywebview shows
      // a native folder-picker and returns {root, path, error?} or null
      // on cancel. Called from onOpenFolder() in js/ui.js.
      open_folder() {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.open_folder;
        if (override) return Promise.resolve(override());
        return Promise.resolve(null);
      },
      // Called from loadChildren() in js/filetree.js to lazily expand a
      // tree node. Real Python returns {entries: [...]}; empty-array
      // default means an unconfigured override just shows no children
      // rather than throwing.
      list_dir(path) {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.list_dir;
        if (override) return Promise.resolve(override(path));
        return Promise.resolve({ entries: [] });
      },
      // Called from js/filetree.js (tree click) and js/ui.js (drag-and-drop
      // open) to load an existing file's content without re-running the
      // open_file dialog. Real Python returns {path, content}; null
      // default matches "file not found/unreadable" rather than throwing.
      read_file(path) {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.read_file;
        if (override) return Promise.resolve(override(path));
        return Promise.resolve(null);
      },
      // Called from js/settings.js to populate the Ollama model picker.
      // Real Python returns {models: [...]}; empty-array default means
      // an unconfigured override shows no models rather than throwing.
      list_ollama_models() {
        const override = window.__inkwaveMockApiOverrides && window.__inkwaveMockApiOverrides.list_ollama_models;
        if (override) return Promise.resolve(override());
        return Promise.resolve({ models: [] });
      },
      save_as(suggestedName) {
        const path = "/mock/saved/" + (suggestedName || "Untitled.md");
        return Promise.resolve({ path });
      },
      // Minimal stubs for API surface area main.js/init.js touch at
      // startup so unrelated code paths don't throw.
      toggle_fullscreen() { return Promise.resolve(null); },
    },
  };

  // window.pywebview.state.loaded fires in real pywebview once the JS
  // bridge is ready; main.js's whenApiReady() polls for window.pywebview.
}
