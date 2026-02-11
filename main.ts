import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { LockScreen } from './LockScreen';

interface LiquidLockSettings {
    pin: string;
    timeoutMinutes: number;
    blurContent: boolean;
    autoLockOnStart: boolean;
}

const DEFAULT_SETTINGS: LiquidLockSettings = {
    pin: '1234',
    timeoutMinutes: 5,
    blurContent: true,
    autoLockOnStart: true
}

export default class LiquidLockPlugin extends Plugin {
    settings: LiquidLockSettings;
    lockScreen: LockScreen;
    idleTimer: number | null = null;
    lastActivityTime: number = Date.now();

    async onload() {
        await this.loadSettings();

        // Initialize LockScreen
        this.lockScreen = new LockScreen(this.app, (pin) => this.checkPin(pin));

        // Add settings tab
        this.addSettingTab(new LiquidLockSettingTab(this.app, this));

        // Event Listeners for Idle Detection
        this.registerDomEvent(document, 'mousemove', () => this.resetIdleTimer());
        this.registerDomEvent(document, 'keydown', () => this.resetIdleTimer());
        this.registerDomEvent(document, 'scroll', () => this.resetIdleTimer());
        this.registerDomEvent(document, 'click', () => this.resetIdleTimer());

        // Focus Loss Listener
        this.registerDomEvent(window, 'blur', () => {
            // Optional: Immediate lock on blur? For now just let timer run
            // Or maybe lock immediately if configured? 
            // Implementing "Auto-Lock on Focus Loss" could be a future setting.
        });

        // Start Idle Loop
        this.checkIdleInterval();

        // Auto Lock on Start
        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoLockOnStart) {
                this.lock();
            }
        });

        // Command to Lock
        this.addCommand({
            id: 'lock-obsidian',
            name: 'Lock Obsidian',
            callback: () => {
                this.lock();
            }
        });

        console.log('Liquid Lock Plugin loaded');
    }

    checkIdleInterval() {
        // Check every 10 seconds
        this.registerInterval(window.setInterval(() => {
            if (this.lockScreen.isLockedState()) return;

            const timeSinceLastActivity = Date.now() - this.lastActivityTime;
            const timeoutMs = this.settings.timeoutMinutes * 60 * 1000;

            if (timeSinceLastActivity > timeoutMs) {
                this.lock();
            }
        }, 1000 * 10)); // 10s check interval
    }

    resetIdleTimer() {
        this.lastActivityTime = Date.now();
    }

    lock() {
        if (!this.lockScreen.isLockedState()) {
            this.lockScreen.lock();
        }
    }

    checkPin(pin: string): boolean {
        return pin === this.settings.pin;
    }

    onunload() {
        this.lockScreen.remove();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class LiquidLockSettingTab extends PluginSettingTab {
    plugin: LiquidLockPlugin;

    constructor(app: App, plugin: LiquidLockPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Liquid Lock Settings' });

        new Setting(containerEl)
            .setName('PIN Code')
            .setDesc('Set the 4-digit PIN to unlock Obsidian.')
            .addText(text => text
                .setPlaceholder('1234')
                .setValue(this.plugin.settings.pin)
                .onChange(async (value) => {
                    this.plugin.settings.pin = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-Lock Timeout (Minutes)')
            .setDesc('Lock after N minutes of inactivity.')
            .addText(text => text
                .setPlaceholder('5')
                .setValue(String(this.plugin.settings.timeoutMinutes))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num)) {
                        this.plugin.settings.timeoutMinutes = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Auto-Lock on Start')
            .setDesc('Automatically lock Obsidian when it starts.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoLockOnStart)
                .onChange(async (value) => {
                    this.plugin.settings.autoLockOnStart = value;
                    await this.plugin.saveSettings();
                }));
    }
}
