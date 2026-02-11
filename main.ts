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

        // Command to Debug Media Detection
        this.addCommand({
            id: 'debug-media-state',
            name: 'Debug Media State (Check Console)',
            callback: () => {
                console.log("--- Liquid Lock Debug Media ---");
                // Check Media Session
                if ('mediaSession' in navigator) {
                    console.log("MediaSession State:", navigator.mediaSession.playbackState);
                } else {
                    console.log("MediaSession API not supported");
                }

                // Check Workspace Leaves
                console.log("Checking Workspace Leaves:");
                this.app.workspace.iterateAllLeaves(leaf => {
                    const viewType = leaf.view.getViewType();
                    console.log(`- Leaf View Type: ${viewType}`);

                    // Inspect MediaView if it matches known types
                    if (viewType.includes('media') || viewType.includes('video') || viewType.includes('bilibili')) {
                        console.log(`  - Potential Media Leaf found: ${viewType}`);
                        // Try to find iframes or videos inside this specific leaf's container
                        const container = (leaf.view as any).contentEl as HTMLElement;
                        const vids = container.querySelectorAll('video');
                        const ifrs = container.querySelectorAll('iframe');
                        const webviews = container.querySelectorAll('webview');
                        console.log(`  - Content: ${vids.length} videos, ${ifrs.length} iframes, ${webviews.length} webviews`);
                    }
                });

                // Check Classes Global
                const playingClasses = ['.plyr--playing', '.is-playing', '.media-playing', '.active-media'];
                playingClasses.forEach(cls => {
                    const el = document.querySelector(cls);
                    if (el) console.log(`Class '${cls}' FOUND.`, el);
                });

                // Check Elements Global
                const videos = document.querySelectorAll('video');
                const iframes = document.querySelectorAll('iframe');
                const webviews = document.querySelectorAll('webview');

                console.log(`Global Search: ${videos.length} videos, ${iframes.length} iframes, ${webviews.length} webviews.`);

                console.log("isMediaPlaying() returns:", this.isMediaPlaying());
                console.log("--- End Debug ---");
            }
        });

        console.log('Liquid Lock Plugin loaded');
    }

    checkIdleInterval() {
        // Check every 10 seconds
        this.registerInterval(window.setInterval(async () => {
            if (this.lockScreen.isLockedState()) return;

            // 1. Check Standard DOM & Shadow DOM (Synchronous)
            if (this.isMediaPlaying()) {
                console.log("Liquid Lock: DOM Media playing detected.");
                this.resetIdleTimer();
                return;
            }

            // 2. Check Webviews (Asynchronous) - for plugins like Media Extended embedding Bilibili
            if (await this.checkWebviews()) {
                console.log("Liquid Lock: Webview Media playing detected.");
                this.resetIdleTimer();
                return;
            }

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

    async checkWebviews(): Promise<boolean> {
        const webviews = document.querySelectorAll('webview');
        for (let i = 0; i < webviews.length; i++) {
            const wv = webviews[i] as any;
            try {
                // Inject script to check for playing media inside the webview's process
                const isPlaying = await wv.executeJavaScript(`
                    (function() {
                        const media = document.querySelectorAll('video, audio');
                        for(let i=0; i<media.length; i++) {
                            if(!media[i].paused && !media[i].ended) return true;
                        }
                        return false;
                    })()
                `);
                if (isPlaying) return true;
            } catch (e) {
                // Ignore errors (e.g., content not loaded, security restrictions)
            }
        }
        return false;
    }

    isMediaPlaying(): boolean {
        // Method 1: Check Global Media Session
        if ('mediaSession' in navigator && navigator.mediaSession.playbackState === 'playing') {
            return true;
        }

        // Method 2: Check for common "playing" classes
        const playingClasses = ['.plyr--playing', '.is-playing', '.media-playing', '.active-media'];
        if (document.querySelector(playingClasses.join(','))) {
            return true;
        }

        const scanForMedia = (root: Document | ShadowRoot | HTMLElement): boolean => {
            try {
                // Check direct Video/Audio elements
                const mediaElements = root.querySelectorAll('video, audio');
                for (let i = 0; i < mediaElements.length; i++) {
                    const media = mediaElements[i] as HTMLMediaElement;
                    if (!media.paused && !media.ended) {
                        return true;
                    }
                }

                // Recursive check for Shadow Roots
                const allElements = root.querySelectorAll('*');
                for (let i = 0; i < allElements.length; i++) {
                    const el = allElements[i];
                    if (el.shadowRoot) {
                        if (scanForMedia(el.shadowRoot)) return true;
                    }
                }

                // Check iframes (only same-origin)
                const iframes = root.querySelectorAll('iframe');
                for (let i = 0; i < iframes.length; i++) {
                    try {
                        const doc = iframes[i].contentDocument;
                        if (doc && scanForMedia(doc)) return true;
                    } catch (e) {
                        // access denied
                    }
                }
            } catch (err) {
                console.error("Liquid Lock: Error scanning media", err);
            }
            return false;
        }

        return scanForMedia(document);
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
