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

                // Debug Electron State
                try {
                    // @ts-ignore
                    const electron = window.require ? window.require('electron') : require('electron');
                    if (electron) {
                        console.log("Electron module: FOUND");
                        if (electron.remote) {
                            console.log("Electron remote: FOUND");
                            const currentWC = electron.remote.getCurrentWebContents();
                            const isAudible = typeof currentWC.isCurrentlyAudible === 'function' ? currentWC.isCurrentlyAudible() : currentWC.isCurrentlyAudible;
                            console.log(`Current WebContents ID: ${currentWC.id}, Audible (Value): ${isAudible}`);

                            const allWC = electron.remote.webContents.getAllWebContents();
                            console.log(`Total WebContents: ${allWC.length}`);
                            allWC.forEach((wc: any) => {
                                const audibleState = typeof wc.isCurrentlyAudible === 'function' ? wc.isCurrentlyAudible() : wc.isCurrentlyAudible;
                                console.log(`- WC ID: ${wc.id}, Type: ${wc.getType()}, Title: '${wc.getTitle()}', Audible: ${audibleState}, Destroyed: ${wc.isDestroyed()}`);
                            });
                        } else {
                            console.log("Electron remote: NOT FOUND (Check @electron/remote?)");
                        }
                    } else {
                        console.log("Electron module: NOT FOUND");
                    }
                } catch (e) {
                    console.error("Electron Debug Failed:", e);
                }

                this.checkAllMediaSources().then(result => {
                    console.log("checkAllMediaSources() async returns:", result);
                    console.log("--- End Debug ---");
                });
            }
        });

        console.log('Liquid Lock Plugin loaded');
    }

    checkIdleInterval() {
        // Check every 10 seconds
        this.registerInterval(window.setInterval(async () => {
            if (this.lockScreen.isLockedState()) return;

            // Perform comprehensive async media check
            const isPlaying = await this.checkAllMediaSources();

            if (isPlaying) {
                console.log("Liquid Lock: Media playing detected.");
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

    // Unified Async Media Check
    async checkAllMediaSources(): Promise<boolean> {
        // 1. Check Global Media Session
        if ('mediaSession' in navigator && navigator.mediaSession.playbackState === 'playing') {
            return true;
        }

        // 2. Check Electron Audio State (The "Nuclear" Option for Cross-Origin/Webviews)
        if (this.checkElectronAudio()) {
            return true;
        }

        // 3. Check for common "playing" classes (DOM check)
        const playingClasses = ['.plyr--playing', '.is-playing', '.media-playing', '.active-media'];
        if (document.querySelector(playingClasses.join(','))) {
            return true;
        }

        // 4. Recursive Scan for Video/Audio/Iframe/Webview
        return await this.scanRootRecursively(document);
    }

    checkElectronAudio(): boolean {
        try {
            // Attempt to access Electron remote to check all webContents
            // @ts-ignore
            const electron = window.require ? window.require('electron') : null;
            if (electron && electron.remote) {
                const allWebContents = electron.remote.webContents.getAllWebContents();
                for (const wc of allWebContents) {
                    if (wc.isDestroyed()) continue;

                    const audible = typeof wc.isCurrentlyAudible === 'function' ? wc.isCurrentlyAudible() : wc.isCurrentlyAudible;
                    if (audible) {
                        return true;
                    }
                }
            }
        } catch (e) {
            // Electron access failed or not available
        }
        return false;
    }

    async scanRootRecursively(root: Document | ShadowRoot | HTMLElement): Promise<boolean> {
        try {
            // A. Direct Video/Audio elements
            const mediaElements = root.querySelectorAll('video, audio');
            for (let i = 0; i < mediaElements.length; i++) {
                const media = mediaElements[i] as HTMLMediaElement;
                if (!media.paused && !media.ended) return true;
            }

            // B. Direct Webview elements (Electron/Obsidian specific)
            try {
                const webviews = root.querySelectorAll('webview');
                for (let i = 0; i < webviews.length; i++) {
                    const wv = webviews[i] as any;
                    try {
                        // Inject RECURSIVE script to check for playing media inside the webview
                        // We serialize the scanner function to run it inside the isolated webview context
                        const isPlaying = await wv.executeJavaScript(`
                            (function() {
                                const scan = (node) => {
                                    // Direct Media
                                    const media = node.querySelectorAll('video, audio');
                                    for(let i=0; i<media.length; i++) {
                                        if(!media[i].paused && !media[i].ended) return true;
                                    }
                                    // Shadow Roots
                                    const all = node.querySelectorAll('*');
                                    for(let i=0; i<all.length; i++) {
                                        if(all[i].shadowRoot && scan(all[i].shadowRoot)) return true;
                                    }
                                    // Iframes (Same-Origin only inside webview)
                                    const iframes = node.querySelectorAll('iframe');
                                    for(let i=0; i<iframes.length; i++) {
                                        try {
                                            if(iframes[i].contentDocument && scan(iframes[i].contentDocument)) return true;
                                        } catch(e){}
                                    }
                                    return false;
                                };
                                return scan(document);
                            })()
                        `);
                        if (isPlaying) return true;
                    } catch (e) { /* Ignore webview access errors */ }
                }
            } catch (e) { /* Ignore if webview query fails */ }

            // C. Recursion: Shadow Roots
            const allElements = root.querySelectorAll('*');
            for (let i = 0; i < allElements.length; i++) {
                const el = allElements[i];
                if (el.shadowRoot) {
                    if (await this.scanRootRecursively(el.shadowRoot)) return true;
                }
            }

            // D. Recursion: Iframes (Same-Origin)
            const iframes = root.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                try {
                    const doc = iframes[i].contentDocument;
                    if (doc) {
                        if (await this.scanRootRecursively(doc)) return true;
                    }
                } catch (e) { /* Cross-origin iframe */ }
            }

        } catch (err) {
            console.error("Liquid Lock: Error scanning source", err);
        }
        return false;
    }

    // Legacy/Sync check kept for compatibility if needed, but primary logic is now in checkAllMediaSources
    isMediaPlaying(): boolean {
        // Simple synchronous check as fallback or for debug command
        return document.querySelectorAll('video, audio').length > 0;
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
