import { DataAdapter } from "obsidian";
import { Buffer } from "buffer/";

/** Node-style error carrying an errno `code`, which isomorphic-git inspects. */
function fsError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

type Stats = {
  type: "file" | "dir";
  mode: number;
  size: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
  uid: number;
  gid: number;
  dev: number;
  // isomorphic-git requires these Node.js-style methods on stat results
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
};

/**
 * Creates a fs-like object for isomorphic-git that wraps Obsidian's DataAdapter.
 * Paths passed by isomorphic-git are ABSOLUTE (prefixed with vaultPath).
 * We strip the vaultPath prefix before calling Obsidian's adapter (which uses relative paths).
 */
export function createFsAdapter(adapter: DataAdapter, vaultPath: string) {
  /** Strip the vault root prefix so Obsidian adapter gets relative paths */
  function rel(absPath: string): string {
    const normalized = absPath.replace(/\\/g, "/");
    const base = vaultPath.replace(/\\/g, "/").replace(/\/$/, "");
    if (normalized.startsWith(base + "/")) {
      return normalized.slice(base.length + 1);
    }
    // The vault root itself. Without this the absolute path leaked through to
    // adapter.list(), the working-tree scan came back empty, and isomorphic-git
    // saw every file as missing (so deletions pulled from the remote never
    // reached the vault and statusMatrix always looked dirty).
    if (normalized === base || normalized === "." || normalized === "") {
      return "";
    }
    return normalized;
  }

  const promises = {
    async readFile(path: string, options?: { encoding?: string }): Promise<Buffer | string> {
      try {
        const content = await adapter.readBinary(rel(path));
        if (options?.encoding === "utf8") {
          return Buffer.from(content).toString("utf8");
        }
        return Buffer.from(content);
      } catch {
        throw fsError("ENOENT", `ENOENT: no such file or directory, open '${path}'`);
      }
    },

    async writeFile(path: string, data: string | Buffer | Uint8Array): Promise<void> {
      const relativePath = rel(path);
      // Ensure parent directory exists
      const parts = relativePath.split("/");
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join("/");
        try { await adapter.mkdir(dir); } catch { /* already exists */ }
      }
      if (typeof data === "string") {
        await adapter.write(relativePath, data);
      } else {
        // Copy into a fresh ArrayBuffer: the source may be a view into a larger shared buffer.
        const exact = new ArrayBuffer(data.byteLength);
        new Uint8Array(exact).set(data);
        await adapter.writeBinary(relativePath, exact);
      }
    },

    async unlink(path: string): Promise<void> {
      try {
        await adapter.remove(rel(path));
      } catch {
        /* ignore if not found */
      }
    },

    async readdir(path: string): Promise<string[]> {
      try {
        const result = await adapter.list(rel(path));
        const files = result.files.map((f) => f.split("/").pop()!);
        const folders = result.folders.map((f) => f.split("/").pop()!);
        return [...folders, ...files];
      } catch {
        throw fsError("ENOENT", `ENOENT: no such file or directory, scandir '${path}'`);
      }
    },

    async mkdir(path: string, _options?: unknown): Promise<void> {
      try {
        await adapter.mkdir(rel(path));
      } catch {
        /* already exists — ignore */
      }
    },

    async rmdir(_path: string): Promise<void> {
      /* isomorphic-git calls rmdir on cleanup — safe to no-op for now */
    },

    async stat(path: string): Promise<Stats> {
      try {
        const relPath = rel(path);
        // Adapter has no stat for the vault root; it is always a directory.
        const s = relPath === "" ? { type: "folder", size: 0, mtime: Date.now(), ctime: Date.now() } : await adapter.stat(relPath);
        if (!s) throw new Error("no stat");
        const isDir = s.type !== "file";
        return {
          type: isDir ? "dir" : "file",
          mode: isDir ? 0o040755 : 0o100644,
          size: s.size ?? 0,
          ino: 0,
          mtimeMs: s.mtime ?? Date.now(),
          ctimeMs: s.ctime ?? Date.now(),
          uid: 1,
          gid: 1,
          dev: 1,
          isFile: () => !isDir,
          isDirectory: () => isDir,
          isSymbolicLink: () => false,
        };
      } catch {
        throw fsError("ENOENT", `ENOENT: no such file or directory, stat '${path}'`);
      }
    },

    async lstat(path: string): Promise<Stats> {
      return promises.stat(path);
    },

    async readlink(path: string): Promise<string> {
      throw fsError("EINVAL", `EINVAL: readlink not supported '${path}'`);
    },

    async symlink(): Promise<void> {
      throw fsError("EINVAL", "EINVAL: symlink not supported");
    },

    async chmod(): Promise<void> {
      /* chmod is a no-op on mobile — isomorphic-git calls it but we can safely ignore */
    },
  };

  return { promises };
}
