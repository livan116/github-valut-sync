import * as git from "isomorphic-git";
import { requestUrl, DataAdapter } from "obsidian";
import { createFsAdapter } from "./fs-adapter";
import {
  GIT_AUTHOR_NAME,
  GIT_AUTHOR_EMAIL,
  GIT_DIR,
  DEFAULT_BRANCH,
} from "../constants";
import { ConflictFile, SyncResult } from "../types";

/** Persisted while a merge has conflicts that the user has not resolved yet. */
interface MergeState {
  /** Remote commit being merged in (second parent of the eventual merge commit). */
  theirs: string;
  /** Files that still need a decision. */
  paths: string[];
}

function errCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

// Custom HTTP client that uses Obsidian's requestUrl (mobile-safe, bypasses CORS)
const gitHttp = {
  async request({ url, method, headers, body }: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: AsyncIterableIterator<Uint8Array>;
  }) {
    let bodyBuffer: ArrayBuffer | undefined;
    if (body) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of body) chunks.push(chunk);
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
      bodyBuffer = merged.buffer;
    }

    const response = await requestUrl({
      url,
      method,
      headers,
      body: bodyBuffer,
      throw: false,
    });

    const arrayBuffer = response.arrayBuffer;
    async function* responseBody() {
      yield new Uint8Array(arrayBuffer);
    }

    return {
      url,
      method,
      statusCode: response.status,
      statusMessage: "OK",
      body: responseBody(),
      headers: response.headers as Record<string, string>,
    };
  },
};

export class GitSync {
  private fs: ReturnType<typeof createFsAdapter>;
  private dir: string;
  private token: string;
  private username: string;
  private remoteUrl: string;

  constructor(
    adapter: DataAdapter,
    vaultPath: string,
    token: string,
    username: string,
    repoName: string
  ) {
    this.fs = createFsAdapter(adapter, vaultPath);
    this.dir = vaultPath;
    this.token = token;
    this.username = username;
    this.remoteUrl = `https://github.com/${username}/${repoName}.git`;
  }

  /** Base options shared by ALL git operations (local and network) */
  private gitOpts() {
    return {
      fs: this.fs,
      http: gitHttp,
      dir: this.dir,
      author: { name: GIT_AUTHOR_NAME, email: GIT_AUTHOR_EMAIL },
    };
  }

  /**
   * Extra options for NETWORK operations (push / fetch / clone).
   *
   * isomorphic-git strips credentials from remote URLs before sending requests.
   * We must supply them via `onAuth` so every push/fetch is authenticated.
   * We also pass `url` directly so the library does not have to read `.git/config`.
   */
  private netOpts() {
    const token = this.token;
    const username = this.username;
    return {
      ...this.gitOpts(),
      url: this.remoteUrl,
      onAuth: () => ({ username, password: token }),
      onAuthFailure: () => {
        throw new Error("GitHub authentication failed. Please reconnect your account in Git Sync settings.");
      },
    };
  }

  /** Returns true if .git exists and HEAD resolves (repo is initialised) */
  async isInitialized(): Promise<boolean> {
    try {
      await git.resolveRef({ fs: this.fs, dir: this.dir, ref: "HEAD" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns true if refs/heads/main exists (at least one commit has been made).
   * Returns false on a fresh git.init with no commits (unborn branch).
   */
  async hasLocalBranch(): Promise<boolean> {
    try {
      await git.resolveRef({ fs: this.fs, dir: this.dir, ref: DEFAULT_BRANCH });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch from origin. Returns the remote branch tip oid, or null ONLY when the
   * remote has no commits yet. Real failures (network, auth, server errors) are
   * thrown so they surface to the user instead of being mistaken for "nothing to
   * pull" — which previously let sync fall through to a push that GitHub then
   * rejected as a non-fast-forward (issue #4).
   */
  private async safeFetch(): Promise<string | null> {
    const info = await git.getRemoteInfo({
      http: gitHttp,
      url: this.remoteUrl,
      onAuth: () => ({ username: this.username, password: this.token }),
    });
    if (!info.refs?.heads?.[DEFAULT_BRANCH]) return null;

    const res = await git.fetch({
      ...this.netOpts(),
      ref: DEFAULT_BRANCH,
      singleBranch: true,
    });
    return (
      res.fetchHead ??
      (await git.resolveRef({
        fs: this.fs,
        dir: this.dir,
        ref: `refs/remotes/origin/${DEFAULT_BRANCH}`,
      }))
    );
  }

  /** True if a path exists in the vault (file or folder). */
  private async pathExists(relPath: string): Promise<boolean> {
    try {
      await this.fs.promises.stat(`${this.dir}/${relPath}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stage local changes, including DELETIONS (issue #5).
   *
   * Callers pass the files that currently exist (manual sync) or the paths that
   * just changed (auto sync). A manual sync never passes deleted files, so we
   * also reconcile against the git index: any tracked file that no longer exists
   * on disk is removed from the index.
   */
  private async stageChanges(changedFiles: string[]): Promise<void> {
    for (const file of changedFiles) {
      if (await this.pathExists(file)) {
        try {
          await git.add({ fs: this.fs, dir: this.dir, filepath: file });
        } catch { /* skip un-stageable files */ }
      } else {
        try {
          await git.remove({ fs: this.fs, dir: this.dir, filepath: file });
        } catch { /* not tracked — nothing to remove */ }
      }
    }

    let tracked: string[] = [];
    try {
      tracked = await git.listFiles({ fs: this.fs, dir: this.dir });
    } catch { /* unborn branch / empty index */ }
    for (const file of tracked) {
      if (!(await this.pathExists(file))) {
        try {
          await git.remove({ fs: this.fs, dir: this.dir, filepath: file });
        } catch { /* ignore */ }
      }
    }
  }

  // ── Pending-merge state (survives restarts) ──────────────────────────────

  private get mergeStatePath(): string {
    return `${this.dir}/${GIT_DIR}/MULTISYNC_MERGE.json`;
  }

  private async readMergeState(): Promise<MergeState | null> {
    try {
      const raw = (await this.fs.promises.readFile(this.mergeStatePath, {
        encoding: "utf8",
      })) as string;
      return JSON.parse(raw) as MergeState;
    } catch {
      return null;
    }
  }

  private async writeMergeState(state: MergeState | null): Promise<void> {
    if (state) {
      await this.fs.promises.writeFile(this.mergeStatePath, JSON.stringify(state));
    } else {
      await this.fs.promises.unlink(this.mergeStatePath);
    }
  }

  private async buildConflicts(state: MergeState): Promise<ConflictFile[]> {
    const ours = await git.resolveRef({ fs: this.fs, dir: this.dir, ref: DEFAULT_BRANCH });
    const out: ConflictFile[] = [];
    for (const path of state.paths) {
      out.push({
        path,
        ours: await this.readBlobText(ours, path),
        theirs: await this.readBlobText(state.theirs, path),
      });
    }
    return out;
  }

  private async readBlobText(oid: string, filepath: string): Promise<string> {
    try {
      const { blob } = await git.readBlob({ fs: this.fs, dir: this.dir, oid, filepath });
      return new TextDecoder().decode(blob);
    } catch {
      return "";
    }
  }

  /**
   * Merge the fetched remote tip into the local branch AND apply the result to
   * the vault. isomorphic-git's merge() only moves refs / creates the merge
   * commit; it never touches the working tree (except to write conflict
   * markers), so without the checkout below remote changes — including remote
   * deletions — were never written into the vault.
   *
   * Returns the list of conflicts (empty when the merge is clean).
   */
  private async integrateRemote(remoteOid: string): Promise<ConflictFile[]> {
    const localHead = await git.resolveRef({ fs: this.fs, dir: this.dir, ref: DEFAULT_BRANCH });
    if (remoteOid === localHead) return [];

    const mergeOpts = {
      fs: this.fs,
      dir: this.dir,
      ours: DEFAULT_BRANCH,
      theirs: remoteOid,
      author: { name: GIT_AUTHOR_NAME, email: GIT_AUTHOR_EMAIL },
      message: "sync: merge remote changes",
      fastForwardOnly: false,
    };

    let result: { alreadyMerged?: boolean };
    try {
      try {
        result = await git.merge(mergeOpts);
      } catch (err) {
        // Shallow clones (made by older versions with depth:1) lack the history
        // needed to find a merge base. Deepen once, then retry.
        if (
          errCode(err) === "MergeNotSupportedError" &&
          (await this.pathExists(`${GIT_DIR}/shallow`))
        ) {
          await git.fetch({
            ...this.netOpts(),
            ref: DEFAULT_BRANCH,
            singleBranch: true,
            depth: 2147483647,
          });
          result = await git.merge(mergeOpts);
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (errCode(err) !== "MergeConflictError") throw err;
      return this.beginConflictedMerge(remoteOid, mergeOpts);
    }

    if (!result.alreadyMerged) {
      // Non-force: refuses (rather than overwrites) if an unsaved local edit
      // collides with an incoming change.
      await git.checkout({ fs: this.fs, dir: this.dir, ref: DEFAULT_BRANCH });
    }
    return [];
  }

  /**
   * Re-run the merge so non-conflicting remote changes plus conflict markers
   * land in the vault, and record which files still need a decision.
   */
  private async beginConflictedMerge(
    remoteOid: string,
    mergeOpts: Parameters<typeof git.merge>[0]
  ): Promise<ConflictFile[]> {
    let paths: string[] = [];
    try {
      await git.merge({ ...mergeOpts, abortOnConflict: false });
    } catch (err) {
      if (errCode(err) !== "MergeConflictError") throw err;
      paths = (err as { data: { filepaths: string[] } }).data.filepaths;
    }
    const state: MergeState = { theirs: remoteOid, paths };
    await this.writeMergeState(state);
    return this.buildConflicts(state);
  }

  /** Commit the resolved merge with both parents so the push is a fast-forward. */
  private async finalizeMerge(state: MergeState): Promise<void> {
    const ours = await git.resolveRef({ fs: this.fs, dir: this.dir, ref: DEFAULT_BRANCH });
    const known = new Set<string>([
      ...(await git.listFiles({ fs: this.fs, dir: this.dir, ref: ours })),
      ...(await git.listFiles({ fs: this.fs, dir: this.dir, ref: state.theirs })),
    ]);
    for (const file of known) {
      if (await this.pathExists(file)) {
        await git.add({ fs: this.fs, dir: this.dir, filepath: file });
      } else {
        try {
          await git.remove({ fs: this.fs, dir: this.dir, filepath: file });
        } catch { /* ignore */ }
      }
    }
    await git.commit({
      ...this.gitOpts(),
      message: "sync: merge remote changes",
      parent: [ours, state.theirs],
    });
    await this.writeMergeState(null);
  }

  private async push(): Promise<void> {
    try {
      await git.push({ ...this.netOpts(), ref: DEFAULT_BRANCH });
    } catch (err) {
      if (errCode(err) === "PushRejectedError") {
        throw new Error(
          "Another device pushed while syncing. Run sync again to merge its changes."
        );
      }
      throw err;
    }
  }

  /**
   * Clone the remote into the vault directory.
   * Returns true if the clone produced a usable local branch (non-empty remote).
   *
   * Full history (no `depth`): a shallow clone has no merge base, which made
   * every later merge fail and left sync stuck (issue #4).
   */
  async clone(): Promise<boolean> {
    await git.clone({
      ...this.netOpts(),
      singleBranch: true,
    });
    return this.hasLocalBranch();
  }

  /**
   * First-time setup: init locally (if needed), commit everything, push.
   * Safe to call on a partially-initialised repo (retry after failure).
   */
  async initAndPush(vaultFiles: string[]): Promise<void> {
    const alreadyInited = await this.isInitialized();
    if (!alreadyInited) {
      await git.init({ fs: this.fs, dir: this.dir, defaultBranch: DEFAULT_BRANCH });
    }

    // Stage all vault files (skip any that fail)
    for (const file of vaultFiles) {
      try {
        await git.add({ fs: this.fs, dir: this.dir, filepath: file });
      } catch {
        // Skip un-stageable files (binary, permission issues, etc.)
      }
    }

    const localBranchExists = await this.hasLocalBranch();
    if (!localBranchExists) {
      // First-ever commit — create it unconditionally so refs/heads/main is written
      // even when the vault is empty.
      await git.commit({
        ...this.gitOpts(),
        message: "sync: initial vault snapshot",
      });
    } else {
      // Subsequent call (retry) — only commit if something changed
      const status = await git.statusMatrix({ fs: this.fs, dir: this.dir });
      const dirty = status.some(([, h, w, s]) => h !== 1 || w !== 1 || s !== 1);
      if (dirty) {
        await git.commit({
          ...this.gitOpts(),
          message: "sync: initial vault snapshot",
        });
      }
    }

    // Set up remote (delete+re-add to ensure correct fetch refspec)
    try {
      await git.deleteRemote({ fs: this.fs, dir: this.dir, remote: "origin" });
    } catch { /* didn't exist yet */ }
    await git.addRemote({
      fs: this.fs,
      dir: this.dir,
      remote: "origin",
      url: this.remoteUrl,
    });

    await git.push({
      ...this.netOpts(),
      ref: DEFAULT_BRANCH,
      force: false,
    });
  }

  /**
   * Full sync cycle — runs on every file change and manual sync trigger.
   *
   * Steps:
   *   0. If an earlier merge still has unresolved conflicts, stop and report
   *      them again (never stage/push conflict markers)
   *   1. Stage all changes, including deletions
   *   2. Commit if dirty  (creates refs/heads/main on first run)
   *   3. Fetch from remote
   *   4. Merge remote into local branch and apply it to the vault
   *   5. Push  (skipped if conflicts or no local branch yet)
   */
  async sync(changedFiles: string[]): Promise<SyncResult> {
    try {
      // ── 0. Unresolved conflicts from a previous sync ───────────────────────
      const pending = await this.readMergeState();
      if (pending) {
        return { success: false, conflictFiles: await this.buildConflicts(pending) };
      }

      // ── 1. Stage ─────────────────────────────────────────────────────────
      await this.stageChanges(changedFiles);

      // ── 2. Commit if dirty ───────────────────────────────────────────────
      // Wrap statusMatrix: some isomorphic-git versions throw on an unborn branch.
      let hasDirty: boolean;
      try {
        const matrix = await git.statusMatrix({ fs: this.fs, dir: this.dir });
        hasDirty = matrix.some(([, h, w, s]) => h !== 1 || w !== 1 || s !== 1);
      } catch {
        // Fall back: assume dirty when files were changed
        hasDirty = changedFiles.length > 0;
      }

      if (hasDirty) {
        const now = new Date().toISOString().replace("T", " ").slice(0, 19);
        await git.commit({
          ...this.gitOpts(),
          message: `sync: ${now}`,
        });
        // refs/heads/main is now guaranteed to exist
      }

      // ── 3. Fetch ─────────────────────────────────────────────────────────
      const remoteOid = await this.safeFetch();

      // ── 4. Merge ─────────────────────────────────────────────────────────
      if (remoteOid && (await this.hasLocalBranch())) {
        const conflicts = await this.integrateRemote(remoteOid);
        if (conflicts.length > 0) {
          return { success: false, conflictFiles: conflicts };
        }
      }

      // ── 5. Push ──────────────────────────────────────────────────────────
      if (await this.hasLocalBranch()) {
        await this.push();
      }

      return { success: true, conflictFiles: [] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, conflictFiles: [], error: msg };
    }
  }

  /**
   * Record the user's decision for one conflicted file. When the last file is
   * resolved the merge is committed (with both parents) and pushed.
   * Returns how many conflicts are still outstanding.
   */
  async resolveConflict(filepath: string, resolvedContent: string): Promise<number> {
    const state = await this.readMergeState();
    if (!state) return 0;

    await this.fs.promises.writeFile(`${this.dir}/${filepath}`, resolvedContent);
    await git.add({ fs: this.fs, dir: this.dir, filepath });

    state.paths = state.paths.filter((p) => p !== filepath);
    if (state.paths.length > 0) {
      await this.writeMergeState(state);
      return state.paths.length;
    }

    await this.finalizeMerge(state);
    await this.push();
    return 0;
  }

  /**
   * Pull-only — used on vault open to get latest without pushing.
   * Uses explicit fetch + merge (not git.pull) for consistent error handling.
   * Returns conflicts, if any (the caller decides how to surface them).
   */
  async pull(): Promise<ConflictFile[]> {
    if (!(await this.hasLocalBranch())) return [];

    const pending = await this.readMergeState();
    if (pending) return this.buildConflicts(pending);

    const remoteOid = await this.safeFetch();
    if (!remoteOid) return [];

    return this.integrateRemote(remoteOid);
  }
}
