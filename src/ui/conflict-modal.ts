import { App, Modal, Setting, Component } from "obsidian";
import { ConflictFile } from "../types";
import { diffSummary } from "../sync/conflict";

type ResolveCallback = (filepath: string, resolvedContent: string) => Promise<void>;

export class ConflictModal extends Modal {
  private conflicts: ConflictFile[];
  private currentIndex = 0;
  private onResolve: ResolveCallback;
  private component: Component;

  constructor(app: App, conflicts: ConflictFile[], onResolve: ResolveCallback) {
    super(app);
    this.conflicts = conflicts;
    this.onResolve = onResolve;
    this.component = new Component();
  }

  onOpen(): void {
    this.component.load();
    this.renderCurrent();
  }

  onClose(): void {
    this.component.unload();
    this.contentEl.empty();
  }

  private renderCurrent(): void {
    const conflict = this.conflicts[this.currentIndex];
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", {
      text: `Sync Conflict (${this.currentIndex + 1} / ${this.conflicts.length})`,
    });
    contentEl.createEl("p", {
      text: `File: ${conflict.path}`,
      cls: "conflict-filepath",
    });

    // Diff summary
    const diffEl = contentEl.createEl("pre", { cls: "git-sync-conflict-diff" });
    diffEl.textContent = diffSummary(conflict);

    // Two-column layout
    const cols = contentEl.createDiv({ cls: "git-sync-conflict-columns" });

    // OURS
    const oursCol = cols.createDiv();
    oursCol.createEl("h4", { text: "Your version (this device)" });
    const oursPre = oursCol.createEl("pre", {
      cls: "git-sync-conflict-version git-sync-conflict-ours",
    });
    oursPre.textContent =
      conflict.ours.slice(0, 2000) +
      (conflict.ours.length > 2000 ? "\n…(truncated)" : "");

    // THEIRS
    const theirsCol = cols.createDiv();
    theirsCol.createEl("h4", { text: "Remote version (other device)" });
    const theirsPre = theirsCol.createEl("pre", {
      cls: "git-sync-conflict-version git-sync-conflict-theirs",
    });
    theirsPre.textContent =
      conflict.theirs.slice(0, 2000) +
      (conflict.theirs.length > 2000 ? "\n…(truncated)" : "");

    // Action buttons
    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Keep Mine").onClick(async () => {
          await this.resolve(conflict, conflict.ours);
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Keep Theirs")
          .setCta()
          .onClick(async () => {
            await this.resolve(conflict, conflict.theirs);
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Open in Editor").onClick(() => {
          this.close();
          void this.app.workspace.openLinkText(conflict.path, "", true);
        })
      );
  }

  private async resolve(conflict: ConflictFile, content: string): Promise<void> {
    await this.onResolve(conflict.path, content);
    this.currentIndex++;
    if (this.currentIndex < this.conflicts.length) {
      this.renderCurrent();
    } else {
      this.close();
    }
  }
}
