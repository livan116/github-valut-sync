# Git Sync

> Sync your Obsidian vault across every device using your own **free private GitHub repo**.  
> No subscription. No cloud fees. Works on desktop (Windows / macOS / Linux) and mobile (iOS / Android).

---

## How It Works

```
Your GitHub Account
        │
        ├── obsidian-personal-notes  ← Vault 1 (all your devices sync here)
        ├── obsidian-work-notes      ← Vault 2 (separate repo, same account)
        └── obsidian-research        ← Vault 3 (separate repo, same account)

Desktop  ──┐
Mobile   ──┼──▶  obsidian-personal-notes  (same private GitHub repo)
Laptop   ──┘
```

1. You connect your GitHub account once (in-browser, one approval click).
2. The plugin auto-creates a **private repo** named after your vault.
3. Every file save is automatically committed and pushed in the background.
4. Every device pulls the latest changes when Obsidian opens.
5. Conflicts are detected and shown with a side-by-side UI to resolve.

---

## Features

- **Works on all devices** — desktop and mobile via isomorphic-git (pure JS, no native binary)
- **One GitHub account, multiple vaults** — each vault gets its own private repo
- **Auto-sync** — changes push silently in the background after a short debounce
- **Pull on open** — always up-to-date when you open Obsidian
- **Conflict resolution UI** — side-by-side view when two devices edit the same file
- **Zero cost** — uses your own free GitHub repos, no server involved
- **No data leaves your account** — all files go into your own private GitHub repo

---

## Requirements

- Obsidian **1.0.0** or later
- A **free GitHub account** — [sign up at github.com](https://github.com/join) if you don't have one
- Internet access for sync (offline edits are queued and synced when back online)
- Node.js **18+** and npm (for building from source)

---

## Part 1 — Developer Setup (Build from Source)

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| npm | 9+ | Bundled with Node.js |
| Git | any | https://git-scm.com |

### 1.1 — Clone the Repository

```bash
git clone https://github.com/livan116/github-valut-sync.git
cd github-valut-sync
```

### 1.2 — Install Dependencies

```bash
npm install
```

This installs:
- `isomorphic-git` — pure-JS git engine (works on mobile, no native binaries)
- `esbuild` — fast bundler
- `typescript` — type checker
- `obsidian` — type definitions only (not bundled)

### 1.3 — Register a GitHub OAuth App

You need to register a free OAuth App so users can log in with their GitHub account.
This is done **once** — the `client_id` is then baked into the plugin code.

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Fill in the form:

   | Field | Value |
   |---|---|
   | Application name | `GitHub Vault Sync` |
   | Homepage URL | `https://github.com/livan116/github-valut-sync` |
   | Authorization callback URL | `https://obsidian.md` *(placeholder — Device Flow doesn't use this)* |

4. Click **Register application**
5. Copy the **Client ID** (looks like `Ov23li...`)
6. Copy `.env.example` to `.env` and set your Client ID:
   ```
   CLIENT_ID=Ov23liYOUR_ACTUAL_ID
   ```

> **Do not** generate a Client Secret — Device Flow doesn't need it and secrets must never be embedded in plugin code.

### 1.4 — Build the Plugin

```bash
# Development build (watch mode — rebuilds on every save)
npm run dev

# Production build (minified, no source maps)
npm run build
```

Both commands output a single `main.js` file in the project root.

**Watch mode** (`npm run dev`) keeps running and rebuilds automatically as you edit source files. Leave it running while you test in Obsidian.

### 1.5 — Project Structure

```
github-valut-sync/
├── src/
│   ├── main.ts                   # Plugin entry point — wires everything together
│   ├── types.ts                  # All TypeScript interfaces & types
│   ├── constants.ts              # App-wide constants (CLIENT_ID injected here at build)
│   ├── auth/
│   │   └── github-device.ts      # GitHub OAuth Device Flow (no server needed)
│   ├── github/
│   │   └── api.ts                # GitHub REST API wrapper (create repo, get user)
│   ├── sync/
│   │   ├── fs-adapter.ts         # Bridges Obsidian DataAdapter → isomorphic-git fs
│   │   ├── git-sync.ts           # Core git operations: init / clone / pull / push
│   │   ├── queue.ts              # Debounced sync queue with mutex (no race conditions)
│   │   └── conflict.ts           # Conflict diff summary helper
│   └── ui/
│       ├── settings-tab.ts       # Plugin settings page
│       ├── conflict-modal.ts     # Side-by-side conflict resolution modal
│       └── status-bar.ts         # Live sync indicator in the status bar
├── .env                          # Local secrets — git-ignored, never committed
├── .env.example                  # Template — copy to .env and fill in CLIENT_ID
├── manifest.json                 # Obsidian plugin manifest
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── main.js                       # Built output (git-ignored, generated by build)
```

---

## Part 2 — Installing the Plugin

### Option A — Manual Install from Build Output

After running `npm run build`:

1. Create the plugin folder inside your vault:
   ```
   YourVault/.obsidian/plugins/github-vault-sync/
   ```
2. Copy these two files into that folder:
   ```
   main.js
   manifest.json
   ```
3. Open Obsidian → **Settings** → **Community plugins**
4. Turn off **Restricted Mode** if prompted
5. Find **GitHub Vault Sync** in the list → toggle it **ON**

**Tip for development:** You can symlink the project directory directly into your vault's plugins folder so the built `main.js` is picked up automatically after each build:

```bash
# Windows (run as Administrator)
mklink /D "C:\path\to\vault\.obsidian\plugins\github-vault-sync" "C:\path\to\github-valut-sync"

# macOS / Linux
ln -s /path/to/github-valut-sync /path/to/vault/.obsidian/plugins/github-vault-sync
```

### Option B — BRAT (Beta Testers)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins.
2. Open BRAT settings → **Add Beta Plugin**
3. Paste the repo URL: `https://github.com/livan116/github-valut-sync`
4. Click **Add Plugin** — BRAT installs it automatically.

---

## Part 3 — Connecting Your GitHub Account

> Do this on **every device** where you want sync. Use the **same GitHub account** each time.

### Step 1 — Open Plugin Settings

Go to **Settings** → **GitHub Vault Sync** (scroll down in the left sidebar under Community Plugins).

### Step 2 — Click "Connect GitHub"

You will see a screen like this:

```
┌─────────────────────────────────────────┐
│  Open this URL in your browser:         │
│  https://github.com/login/device        │
│                                         │
│           AB12-CD34                     │
│                                         │
│  Waiting for approval in browser…       │
└─────────────────────────────────────────┘
```

Your browser will open automatically. If it doesn't, copy the URL manually.

### Step 3 — Enter the Code in Your Browser

1. The GitHub page asks: **"Enter the code shown in your app"**
2. Type in the 8-character code (e.g. `AB12-CD34`)
3. Click **Continue**
4. Review what access the plugin requests: **private repos** (to create and sync your vault repo)
5. Click **Authorize**

### Step 4 — Done

Back in Obsidian you'll see:

```
Connected as @your-github-username. Vault syncing started!
```

The plugin will:
- **First device**: Create a new private repo named `obsidian-<your-vault-name>` and push all your files.
- **Additional devices**: Detect the existing repo and clone it automatically.

---

## Part 4 — Using the Plugin

### Automatic Sync

Once connected, the plugin runs silently in the background:

| Event | What happens |
|---|---|
| You save / edit a file | Changes are committed and pushed after 3 seconds of inactivity |
| You open Obsidian | Latest changes are pulled from GitHub |
| You close Obsidian | Any pending changes are flushed and pushed |
| Two devices edit same file | Conflict modal appears next time you open Obsidian |

### Status Bar

The bottom-right corner shows the current sync state:

| Indicator | Meaning |
|---|---|
| `✓ MultiSync` | All good, fully synced |
| `↓ Syncing…` | Pulling from GitHub |
| `↑ Syncing…` | Pushing to GitHub |
| `⚠ Conflict` | Two devices edited the same file — action needed |
| `✗ Sync Error` | Network or auth issue — hover for detail |

Click the status bar item to trigger an **immediate manual sync** at any time.

### Manual Sync

- Click the status bar item, **or**
- Open the Command Palette (`Ctrl/Cmd + P`) → search **"MultiSync: Sync vault now"**

---

## Part 5 — Resolving Conflicts

A conflict happens when the **same file** is edited on two devices before either has synced.

When the plugin detects a conflict, a modal appears automatically:

```
┌──────────────────────────────────────────────────┐
│  Sync Conflict (1 / 2)                           │
│  File: notes/daily/2025-06-01.md                 │
│                                                  │
│  Changed lines:                                  │
│  Line 4:                                         │
│    - meeting at 3pm                              │
│    + meeting at 4pm                              │
│                                                  │
│  YOUR VERSION        │  REMOTE VERSION           │
│  ──────────────────  │  ─────────────────        │
│  # June 1            │  # June 1                 │
│  meeting at 3pm      │  meeting at 4pm           │
│                                                  │
│  [Keep Mine]  [Keep Theirs]  [Open in Editor]    │
└──────────────────────────────────────────────────┘
```

| Button | Action |
|---|---|
| **Keep Mine** | Use the version from this device, discard remote changes |
| **Keep Theirs** | Use the remote version, discard local changes |
| **Open in Editor** | Close modal, open the file — edit it manually, then sync again |

After resolving, the file is immediately committed and pushed.

---

## Part 6 — Multiple Vaults

Each vault gets its **own separate repo** automatically. There's nothing extra to configure.

```
Vault: "Personal Notes"   →  github.com/you/obsidian-personal-notes
Vault: "Work"             →  github.com/you/obsidian-work
Vault: "Research"         →  github.com/you/obsidian-research
```

On each device:
1. Open the vault in Obsidian.
2. Go to **Settings → GitHub Vault Sync** → connect your GitHub account.
3. The plugin detects which vault is open and connects to the right repo automatically.

---

## Part 7 — Settings Reference

| Setting | Default | Description |
|---|---|---|
| **Auto-sync** | On | Automatically sync on file changes |
| **Sync debounce** | 3000 ms | How long to wait after your last keystroke before syncing |
| **Excluded patterns** | See below | Files/folders that will never be synced |

### Default Excluded Patterns

```
.obsidian/workspace
.obsidian/workspace.json
.obsidian/plugins/*/data.json
```

These are excluded because they change frequently, are device-specific, and don't need to be shared.

To add more exclusions, open **Settings → GitHub Vault Sync → Excluded patterns** and add one pattern per line. Wildcards (`*`) are supported.

Example — exclude all files in a `Private` folder:
```
Private/*
```

---

## Troubleshooting

### "Device code expired"
The 8-character code has a 15-minute expiry. Click **Connect GitHub** again to get a fresh code.

### "Access denied"
You clicked **Cancel** on the GitHub authorization page. Click **Connect GitHub** to try again.

### Sync shows `✗ Sync Error`
1. Check your internet connection.
2. Open **Settings → GitHub Vault Sync** — if disconnected, click **Connect GitHub** to re-authenticate.
3. GitHub tokens occasionally expire — reconnecting issues a fresh token.

### Files not appearing on second device
1. Make sure you connected the **same GitHub account** on both devices.
2. Check the status bar on both devices — both should show `✓ MultiSync`.
3. Trigger a manual sync on the device that has the new files (`Ctrl/Cmd + P` → "Sync vault now").

### Mobile — "Cannot sync"
- Ensure your mobile device has an internet connection.
- The plugin uses Obsidian's built-in HTTP layer so it does not need special mobile permissions.
- If syncing fails on mobile, try disconnecting and reconnecting your GitHub account.

### `.git` folder visible in vault
The `.git` folder is hidden in Obsidian by default. If you see it, go to  
**Settings → Files & Links → Excluded files** and add `.git`.

### Build fails with "Cannot find module 'obsidian'"
Run `npm install` to install devDependencies. The `obsidian` package provides types only.

### Build warns "CLIENT_ID is not set"
Copy `.env.example` to `.env` and fill in your GitHub OAuth App Client ID.

### TypeScript errors after pulling
Run `npm install` — a dependency may have been added. Then re-run `npm run build`.

---

## FAQ

**Q: Is my data private?**  
A: Yes. The plugin creates a **private** GitHub repo. Only your GitHub account can access it.

**Q: Does the plugin developer see my notes?**  
A: No. The plugin runs entirely on your device and connects directly to your own GitHub account. There is no intermediate server.

**Q: What happens if I edit the same file on two offline devices?**  
A: When both devices come online, the plugin detects the conflict and shows you the resolution modal.

**Q: Can I use this with an existing vault that already has files?**  
A: Yes. On first connection, the plugin pushes all your existing files to the new GitHub repo.

**Q: Does this work with Obsidian's built-in sync?**  
A: It's designed to replace, not complement, Obsidian Sync. Using both at once is not recommended as they may conflict.

**Q: What is the storage limit?**  
A: GitHub repos have a soft limit of 1 GB per repo. A typical Obsidian vault of markdown files is well under 100 MB.

**Q: Can I view my notes on GitHub directly?**  
A: Yes — GitHub renders Markdown files beautifully. Browse your private repo at `github.com/your-github-username/obsidian-<vaultname>`.

**Q: Why does the plugin need the `repo` OAuth scope?**  
A: The `repo` scope is the minimum required to create and push to **private** repositories. Without it GitHub only allows access to public repos.

---

## Privacy & Security

- Your GitHub **access token** is stored only in Obsidian's local plugin data folder (`.obsidian/plugins/github-vault-sync/data.json`) on each device. It never leaves your device except to communicate directly with GitHub's API.
- The plugin requests only the **`repo` scope** — the minimum required to create and access private repositories.
- To revoke access at any time: GitHub → Settings → Applications → Authorized OAuth Apps → **Revoke**.

---

## Architecture Notes (for Contributors)

| Concern | Solution | Why |
|---|---|---|
| Auth | GitHub OAuth Device Flow | No server or callback URL needed |
| Storage | User's own private GitHub repo | Free, private, version-controlled |
| Sync engine | isomorphic-git (pure JS) | Works on iOS/Android — no native binaries |
| File system | Custom adapter wrapping DataAdapter | Obsidian's API works on all platforms |
| HTTP | Obsidian's `requestUrl` API | Bypasses CORS, works on mobile |

**Key constraints:**
- Never use `require('fs')` — always use the `fs-adapter` so mobile works.
- Always pull before push — enforced in `git-sync.ts::sync()`.
- Always use `requestUrl` from obsidian for HTTP — never `fetch` or `axios`.
- Never store the GitHub token anywhere other than `this.saveData()`.

---

## Contributing

Pull requests welcome!

```bash
# 1. Fork and clone
git clone https://github.com/livan116/github-valut-sync.git
cd github-valut-sync

# 2. Install deps
npm install

# 3. Copy .env.example to .env and set your CLIENT_ID
cp .env.example .env

# 4. Start watch mode
npm run dev

# 5. Symlink into your test vault (see Part 2 above)
# 6. Make your changes — Obsidian hot-reloads the plugin automatically
# 7. Run a type check before submitting
npx tsc --noEmit
```

For bugs and feature requests, open an [issue](https://github.com/livan116/github-valut-sync/issues).

---

## License

MIT © 2025 Livan Kumar
