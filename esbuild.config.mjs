import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "module";
import { existsSync } from "fs";

// Load .env (local dev) with Node's built-in loader (Node 20.12+). It never overrides
// variables that are already set, so a real environment variable (e.g. a CI secret) wins.
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    console.warn("Could not read .env; continuing without it.");
  }
}

const prod = process.argv[2] === "production";

// Public client ID of the plugin author's OAuth app. Used only as a fallback so
// release builds keep working when no CLIENT_ID is supplied; forks should set their own.
const DEFAULT_CLIENT_ID = "Ov23liN8a7D1bDe2571X";

let clientId = (process.env.CLIENT_ID ?? "").trim();
if (!clientId || clientId.includes("YOUR_ACTUAL_ID")) {
  console.warn(
    "\n⚠  CLIENT_ID is not set. Falling back to the original author's OAuth app.\n" +
      "   Copy .env.example to .env and set your own GitHub OAuth App Client ID.\n"
  );
  clientId = DEFAULT_CLIENT_ID;
}

// `buffer` is intentionally NOT external: mobile Obsidian has no Node.js, so the
// browser build of Buffer must be bundled (see src/buffer-shim.ts).
const nodeBuiltins = builtinModules.filter((m) => m !== "buffer" && m !== "node:buffer");

esbuild
  .build({
    banner: { js: "/* obsidian-multisync */" },
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
      "obsidian",
      "electron",
      "@codemirror/autocomplete",
      "@codemirror/collab",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/highlight",
      "@lezer/lr",
      ...nodeBuiltins,
    ],
    // Replaced at build time (see src/constants.ts); nothing here may reference Node globals at runtime.
    define: { __CLIENT_ID__: JSON.stringify(clientId) },
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    minify: prod,
  })
  .catch(() => process.exit(1));
