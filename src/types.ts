export interface PluginSettings {
  githubToken: string;           // OAuth access token (stored locally)
  githubUsername: string;        // Authenticated GitHub username
  repoName: string;              // e.g. "obsidian-my-vault"
  autoSync: boolean;             // auto-sync on file changes
  syncIntervalMs: number;        // debounce window
  excludePatterns: string[];     // glob patterns to ignore (e.g. ".obsidian/workspace")
  lastSyncTime: number;          // unix timestamp of last successful sync
  commitMessageTemplate: string; // e.g. "sync: {{datetime}}"
}

export const DEFAULT_SETTINGS: PluginSettings = {
  githubToken: "",
  githubUsername: "",
  repoName: "",
  autoSync: true,
  syncIntervalMs: 3000,
  excludePatterns: [], // filled from defaultExcludePatterns(configDir) in loadSettings
  lastSyncTime: 0,
  commitMessageTemplate: "sync: {{datetime}}",
};

/**
 * Default exclusions. The config folder is user-configurable in Obsidian, so it is
 * passed in (Vault#configDir) rather than hard-coded. The data.json pattern keeps
 * the stored GitHub token out of the repo — do not remove it.
 */
export function defaultExcludePatterns(configDir: string): string[] {
  return [
    `${configDir}/workspace`,
    `${configDir}/workspace.json`,
    `${configDir}/plugins/*/data.json`,
  ];
}

export interface DeviceFlowResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface GitHubUser {
  login: string;
  id: number;
  name: string;
  email: string;
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  private: boolean;
  clone_url: string;
  html_url: string;
}

export type SyncStatus =
  | "idle"
  | "pulling"
  | "pushing"
  | "conflict"
  | "error"
  | "connecting";

export interface ConflictFile {
  path: string;
  ours: string;   // local file content
  theirs: string; // remote file content
}

export interface SyncResult {
  success: boolean;
  conflictFiles: ConflictFile[];
  error?: string;
}
