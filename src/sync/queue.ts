import { SYNC_DEBOUNCE_MS } from "../constants";
import { GitSync } from "./git-sync";
import { SyncResult, SyncStatus } from "../types";

type StatusCallback = (status: SyncStatus, detail?: string) => void;

export class SyncQueue {
  private pendingFiles = new Set<string>();
  private debounceTimer: number | null = null;
  private running = false;
  private gitSync: GitSync;
  private onStatus: StatusCallback;

  constructor(gitSync: GitSync, onStatus: StatusCallback) {
    this.gitSync = gitSync;
    this.onStatus = onStatus;
  }

  /** Enqueue a changed file path. Debounces before triggering sync. */
  enqueue(filepath: string): void {
    this.pendingFiles.add(filepath);
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => this.flush(), SYNC_DEBOUNCE_MS);
  }

  /** Immediately drain the queue (used on vault close). */
  async flushNow(): Promise<SyncResult | null> {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    return this.flush();
  }

  private async flush(): Promise<SyncResult | null> {
    if (this.running || this.pendingFiles.size === 0) return null;

    this.running = true;
    const filesToSync = [...this.pendingFiles];
    this.pendingFiles.clear();

    try {
      this.onStatus("pushing");
      const result = await this.gitSync.sync(filesToSync);

      if (result.conflictFiles.length > 0) {
        this.onStatus("conflict");
      } else if (result.success) {
        this.onStatus("idle");
      } else {
        this.onStatus("error", result.error);
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.onStatus("error", msg);
      return { success: false, conflictFiles: [], error: msg };
    } finally {
      this.running = false;
      // If more files arrived while we were syncing, flush again
      if (this.pendingFiles.size > 0) {
        window.setTimeout(() => this.flush(), 500);
      }
    }
  }
}
