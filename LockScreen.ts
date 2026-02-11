import { App } from 'obsidian';

export class LockScreen {
    app: App;
    private overlay: HTMLElement | null = null;
    private checkPinCallback: (pin: string) => boolean;
    private currentPinInput: string = "";
    private isLocked: boolean = false;

    constructor(app: App, checkPinCallback: (pin: string) => boolean) {
        this.app = app;
        this.checkPinCallback = checkPinCallback;
    }

    lock() {
        if (this.isLocked) return;
        this.isLocked = true;
        this.render();
    }

    render() {
        this.currentPinInput = ""; // Reset input on code

        // Remove existing if any (safety check)
        this.remove();

        this.overlay = document.body.createEl('div', { cls: 'liquid-lock-overlay' });

        // Background Animation Layer
        this.overlay.createEl('div', { cls: 'liquid-lock-bg-anim' });

        // Glass Container
        const container = this.overlay.createEl('div', { cls: 'liquid-lock-glass-container' });

        // Title/Icon
        container.createEl('h2', { text: 'Locked', cls: 'liquid-lock-title' });

        // PIN Display (dots)
        const pinDisplay = container.createEl('div', { cls: 'liquid-lock-pin-display' });
        const dots: HTMLElement[] = [];
        for (let i = 0; i < 4; i++) {
            dots.push(pinDisplay.createEl('div', { cls: 'liquid-lock-pin-dot' }));
        }

        // Message Area
        const messageEl = container.createEl('div', { cls: 'liquid-lock-message' });

        // Numpad
        const numpad = container.createEl('div', { cls: 'liquid-lock-numpad' });
        const chars = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];

        chars.forEach(char => {
            if (char === '') {
                numpad.createEl('div'); // Spacer
                return;
            }

            const btn = numpad.createEl('button', { cls: 'liquid-lock-num-btn', text: char === 'DEL' ? '⌫' : char });
            btn.onclick = (e) => {
                e.stopPropagation(); // Prevent focusing underlying elements
                this.handleInput(char, dots, messageEl, container);
            };
        });

        // Prevent interaction with underlying app variables
        this.overlay.onkeydown = (e) => {
            e.stopPropagation();
            // Basic keyboard support
            if (e.key >= '0' && e.key <= '9') {
                this.handleInput(e.key, dots, messageEl, container);
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                this.handleInput('DEL', dots, messageEl, container);
            }
        };

        // Focus trap mainly for keydown events
        this.overlay.tabIndex = 0;
        this.overlay.focus();
    }

    private handleInput(char: string, dots: HTMLElement[], messageEl: HTMLElement, container: HTMLElement) {
        if (char === 'DEL') {
            this.currentPinInput = this.currentPinInput.slice(0, -1);
        } else {
            if (this.currentPinInput.length < 4) {
                this.currentPinInput += char;
            }
        }

        // Update Dots
        dots.forEach((dot, index) => {
            if (index < this.currentPinInput.length) {
                dot.addClass('filled');
            } else {
                dot.removeClass('filled');
            }
        });

        // Check PIN if full
        if (this.currentPinInput.length === 4) {
            // Small delay for visual feedback
            setTimeout(() => {
                if (this.checkPinCallback(this.currentPinInput)) {
                    this.unlock();
                } else {
                    // Shake animation
                    container.addClass('liquid-lock-shake');
                    messageEl.innerText = "Incorrect PIN";
                    this.currentPinInput = "";
                    dots.forEach(d => d.removeClass('filled'));

                    setTimeout(() => {
                        container.removeClass('liquid-lock-shake');
                        messageEl.innerText = "";
                    }, 500);
                }
            }, 100);
        }
    }

    unlock() {
        this.isLocked = false;
        this.remove();
    }

    remove() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    isLockedState() {
        return this.isLocked;
    }
}
