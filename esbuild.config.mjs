import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "module";
import dotenv from "dotenv";

// Load .env (local dev). Real environment variables (e.g. a CI secret) win.
dotenv.config({ quiet: true });

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
    // Replaced at build time; `process` does not exist on mobile, so it must never survive into main.js.
    define: { "process.env.CLIENT_ID": JSON.stringify(clientId) },
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    minify: prod,
  })
  .catch(() => process.exit(1));
