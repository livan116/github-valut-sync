import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "module";

const prod = process.argv[2] === "production";

// Electron on desktop provides the Node builtins, so they stay external.
// Mobile has no Node runtime at all, so `buffer` has to be bundled from the
// npm polyfill and injected as a global. See src/buffer-shim.ts.
const externalBuiltins = builtinModules.filter(
  (mod) => mod !== "buffer" && mod !== "node:buffer"
);

esbuild.build({
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
    ...externalBuiltins,
  ],
  inject: ["src/buffer-shim.ts"],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});
