import { App, PluginSettingTab, Setting, Notice, ButtonComponent } from "obsidian";
import type MultiSyncPlugin from "../main";
import { requestDeviceCode, pollForToken } from "../auth/github-device";
import { getAuthenticatedUser } from "../github/api";

export class MultiSyncSettingsTab extends PluginSettingTab {
  plugin: MultiSyncPlugin;

  constructor(app: App, plugin: MultiSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;

    // ── Account section ──────────────────────────────────────────────────────
    new Setting(containerEl).setName("GitHub account").setHeading();

    if (settings.githubToken && settings.githubUsername) {
      // Connected state
      new Setting(containerEl)
        .setName("Connected account")
        .setDesc(`Signed in as @${settings.githubUsername}`)
        .addButton((btn) =>
          btn
            .setButtonText("Disconnect")
            .setWarning()
            .onClick(async () => {
              settings.githubToken = "";
              settings.githubUsername = "";
              settings.repoName = "";
              await this.plugin.saveSettings();
              this.display();
              new Notice("Disconnected from GitHub.");
            })
        );

      new Setting(containerEl)
        .setName("Vault repo")
        .setDesc(`github.com/${settings.githubUsername}/${settings.repoName}`);
    } else {
      // Disconnected state
      new Setting(containerEl)
        .setName("Connect GitHub account")
        .setDesc(
          "Authorise MultiSync to access your private repos. Opens a browser window."
        )
        .addButton((btn) => {
          btn
            .setButtonText("Connect GitHub")
            .setCta()
            .onClick(async () => {
              await this.startDeviceFlow(btn);
            });
        });
    }

    // ── Sync options ──────────────────────────────────────────────────────────
    new Setting(containerEl).setName("Sync options").setHeading();

    new Setting(containerEl)
      .setName("Auto-sync")
      .setDesc("Automatically sync when files are modified.")
      .addToggle((toggle) =>
        toggle.setValue(settings.autoSync).onChange(async (val) => {
          settings.autoSync = val;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Sync debounce (ms)")
      .setDesc("Wait this many milliseconds after the last edit before syncing.")
      .addSlider((slider) =>
        slider
          .setLimits(1000, 10000, 500)
          .setValue(settings.syncIntervalMs)
          .setDynamicTooltip()
          .onChange(async (val) => {
            settings.syncIntervalMs = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Excluded patterns")
      .setDesc("One pattern per line. These files will never be synced.")
      .addTextArea((ta) =>
        ta
          .setValue(settings.excludePatterns.join("\n"))
          .onChange(async (val) => {
            settings.excludePatterns = val
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    // ── Manual sync ───────────────────────────────────────────────────────────
    new Setting(containerEl).setName("Manual sync").setHeading();

    new Setting(containerEl)
      .setName("Sync now")
      .setDesc("Immediately push all local changes and pull remote changes.")
      .addButton((btn) =>
        btn.setButtonText("Sync Now").onClick(async () => {
          await this.plugin.triggerManualSync();
        })
      );

    // ── Last sync time ────────────────────────────────────────────────────────
    if (settings.lastSyncTime > 0) {
      const lastSync = new Date(settings.lastSyncTime).toLocaleString();
      containerEl.createEl("p", {
        text: `Last synced: ${lastSync}`,
        cls: "setting-item-description",
      });
    }
  }

  private async startDeviceFlow(btn: ButtonComponent): Promise<void> {
    // buttonEl.disabled works on every Obsidian version (ButtonComponent.setDisabled needs 1.2.3+)
    btn.setButtonText("Connecting…");
    btn.buttonEl.disabled = true;

    try {
      const deviceFlow = await requestDeviceCode();

      // Show the user their one-time code
      const modal = this.containerEl.createDiv({ cls: "git-sync-device-panel" });
      modal.createEl("p", {
        text: "Open this URL in your browser and enter the code below:",
      });
      modal.createEl("a", {
        text: deviceFlow.verification_uri,
        href: deviceFlow.verification_uri,
        cls: "git-sync-device-link",
      });
      modal.createEl("h1", {
        text: deviceFlow.user_code,
        cls: "git-sync-user-code",
      });
      modal.createEl("p", {
        text: "Waiting for you to approve in the browser…",
        cls: "setting-item-description",
      });

      // Restore button so the user can cancel / retry while waiting
      btn.setButtonText("Cancel");
      btn.buttonEl.disabled = false;

      // Open browser automatically
      window.open(deviceFlow.verification_uri, "_blank");

      // Poll until approved
      const token = await pollForToken(
        deviceFlow.device_code,
        deviceFlow.interval,
        deviceFlow.expires_in
      );

      modal.remove();

      // Get user info
      const user = await getAuthenticatedUser(token);
      this.plugin.settings.githubToken    = token;
      this.plugin.settings.githubUsername = user.login;

      // Initialise the repo
      await this.plugin.initializeRepo(token, user.login);

      await this.plugin.saveSettings();
      new Notice(`Connected as @${user.login}. Vault syncing started!`);
      this.display();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Remove the code panel if it's still visible
      this.containerEl.querySelector(".git-sync-device-panel")?.remove();
      new Notice(`Connection failed: ${msg}`);
      btn.setButtonText("Connect GitHub");
      btn.buttonEl.disabled = false;
    }
  }
}
