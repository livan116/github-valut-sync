import { Plugin } from "obsidian";
import { SyncStatus } from "../types";

const STATUS_ICONS: Record<SyncStatus, string> = {
  idle:       "✓ MultiSync",
  pulling:    "↓ Syncing…",
  pushing:    "↑ Syncing…",
  conflict:   "⚠ Conflict",
  error:      "✗ Sync Error",
  connecting: "… Connecting",
};

export class StatusBarItem {
  private el: HTMLElement;

  constructor(plugin: Plugin) {
    this.el = plugin.addStatusBarItem();
    this.el.addClass("git-sync-status-item");
    this.set("idle");
  }

  set(status: SyncStatus, detail?: string): void {
    const label = STATUS_ICONS[status];
    this.el.setText(detail ? `${label}: ${detail}` : label);
    this.el.setAttribute("data-sync-status", status);
  }

  onClick(handler: () => void): void {
    this.el.addEventListener("click", handler);
  }
}
