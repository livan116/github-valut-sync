/**
 * Mobile polyfill: Obsidian on iOS/Android runs in a plain web view with no
 * Node.js, so the global `Buffer` that isomorphic-git relies on does not exist.
 * Desktop (Electron) already has it, so we only install the browser build when
 * it is missing.
 *
 * The trailing slash in "buffer/" forces resolution to the bundled npm package
 * instead of the Node.js built-in module of the same name.
 *
 * This module MUST be the first import in main.ts so the global is defined
 * before any other bundled module is evaluated.
 */
import { Buffer } from "buffer/";

const host = window as unknown as { Buffer?: typeof Buffer };
if (typeof host.Buffer === "undefined") {
  host.Buffer = Buffer;
}
