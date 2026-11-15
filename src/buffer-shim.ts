/**
 * Mobile polyfill: Obsidian on iOS/Android runs in a plain web view with no
 * Node.js, so the global `Buffer` that isomorphic-git (and src/sync/fs-adapter.ts)
 * rely on does not exist. Desktop (Electron) already has it, so we only
 * install the browser build when it is missing.
 *
 * This module MUST be the first import in main.ts so the global is defined
 * before any other bundled module is evaluated.
 */
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (typeof g.Buffer === "undefined") {
  g.Buffer = Buffer;
}
