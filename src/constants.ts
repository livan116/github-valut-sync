// Injected by esbuild `define` at build time (see esbuild.config.mjs).
export const CLIENT_ID: string = process.env.CLIENT_ID ?? "";

export const GITHUB_DEVICE_URL = "https://github.com/login/device/code";
export const GITHUB_TOKEN_URL  = "https://github.com/login/oauth/access_token";
export const GITHUB_API_BASE   = "https://api.github.com";

export const PLUGIN_ID         = "obsidian-multisync";
export const GIT_AUTHOR_NAME   = "ObsidianMultiSync";
export const GIT_AUTHOR_EMAIL  = "sync@obsidian.local";
export const GIT_DIR           = ".git";
export const SYNC_DEBOUNCE_MS  = 3000;
export const SYNC_ON_OPEN      = true;
export const SYNC_ON_CLOSE     = true;
export const DEFAULT_BRANCH    = "main";
