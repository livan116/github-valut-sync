/**
 * Obsidian on iOS and Android runs in a plain WebView, not Electron, so there
 * is no Node "buffer" module and no global `Buffer`.
 *
 * Two things need it anyway:
 *   - isomorphic-git's transitive deps (safe-buffer, readable-stream, crc-32)
 *     call require("buffer"), and
 *   - src/sync/fs-adapter.ts uses the global `Buffer` directly.
 *
 * With both missing, the plugin throws while Obsidian is still evaluating
 * main.js, so Obsidian reports "Failed to load plugin" and onload never runs.
 *
 * esbuild injects this module wherever `Buffer` is referenced (see the
 * `inject` option in esbuild.config.mjs). The import is what makes esbuild
 * bundle the polyfill rather than leaving `buffer` as an external require().
 */
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

export { Buffer };
