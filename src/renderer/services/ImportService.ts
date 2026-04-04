import { state } from '../state.js';
import { $, showToast, showLoading, SENSITIVE_KEYWORDS } from '../utils.js';
import { actionService } from './ActionService.js';
import { EnvVar } from '../types.js';

export class ImportService {
    // Modal elements
    private importOverlay = $('import-modal-overlay');
    private importText = $('import-text-input') as HTMLTextAreaElement;
    private btnImportFile = $('btn-import-file');
    private btnImportSave = $('import-modal-save');
    private btnImportCancel = $('import-modal-cancel');
    private btnImportClose = $('import-modal-close');
    private btnReveal = $('btn-import-reveal');
    private btnImportInfo = $('btn-import-info');
    private helpOverlay = $('import-help-overlay');
    private btnHelpClose = $('import-help-close');
    private btnHelpOk = $('import-help-ok');
    private isRevealed = false;

    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        if (!this.importOverlay) return;

        this.btnImportSave.onclick = () => this.handleTextImport();
        this.btnImportCancel.onclick = () => this.closeImportModal();
        this.btnImportClose.onclick = () => this.closeImportModal();
        this.btnImportFile.onclick = () => this.handleFileImport();
        
        this.importText.oninput = () => {
            this.updateRevealUI();
        };

        if (this.btnReveal) {
            this.btnReveal.onclick = () => {
                this.isRevealed = !this.isRevealed;
                this.updateRevealUI();
            };
        }

        if (this.btnImportInfo) {
            this.btnImportInfo.onclick = () => {
                if (this.helpOverlay) this.helpOverlay.classList.add('active');
            };
        }

        if (this.btnHelpClose) {
            this.btnHelpClose.onclick = () => {
                if (this.helpOverlay) this.helpOverlay.classList.remove('active');
            };
        }

        if (this.btnHelpOk) {
            this.btnHelpOk.onclick = () => {
                if (this.helpOverlay) this.helpOverlay.classList.remove('active');
            };
        }
    }

    private updateRevealUI() {
        if (!this.importText || !this.btnReveal) return;
        
        const rawText = this.importText.value;
        const hasText = rawText.trim().length > 0;
        const upper = rawText.toUpperCase();
        const hasSensitive = SENSITIVE_KEYWORDS.some(k => upper.includes(k.toUpperCase()));

        // Only show reveal button if we actually have sensitive content
        this.btnReveal.style.display = hasSensitive ? 'flex' : 'none';

        const label = $('import-reveal-label');
        if (label) label.textContent = this.isRevealed ? 'Hide' : 'Reveal';
        
        const icon = $('import-reveal-icon');
        if (icon) {
            icon.innerHTML = this.isRevealed 
                ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
                : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        }

        // Apply protection ONLY if sensitive AND not revealed
        const shouldProtect = hasSensitive && !this.isRevealed;
        (this.importText.style as any).webkitTextSecurity = shouldProtect ? 'disc' : 'none';
        this.importText.style.filter = shouldProtect ? 'blur(4px)' : 'none';
    }

    openImportModal() {
        this.importText.value = '';
        this.isRevealed = false;
        this.updateRevealUI();
        this.importOverlay.classList.add('active');
    }

    closeImportModal() {
        this.importOverlay.classList.remove('active');
    }

    async handleFileImport() {
        const result = await window.electronAPI.importEnvVars();
        if (result.success && result.vars) {
            this.closeImportModal();
            this.openImportReviewModal(result.vars);
        } else if (result.error) {
            showToast(result.error, 'error');
        }
    }

    private handleTextImport() {
        const text = this.importText.value.trim();
        if (!text) {
            showToast('Please paste variables or select a file', 'warning');
            return;
        }

        let vars: EnvVar[] = [];
        try {
            if (text.trim().startsWith('{')) {
                // Parse as JSON
                const data = JSON.parse(text);
                
                if (Array.isArray(data)) {
                    vars = data;
                } else {
                    // Flatten nested objects and arrays
                    const flatten = (obj: any, prefix = ''): { name: string, value: string }[] => {
                        let items: { name: string, value: string }[] = [];
                        if (Array.isArray(obj)) {
                            obj.forEach((val, idx) => {
                                const newKey = `${prefix}__${idx + 1}`;
                                if (val !== null && typeof val === 'object') {
                                    items.push(...flatten(val, newKey));
                                } else {
                                    items.push({ name: newKey, value: String(val) });
                                }
                            });
                        } else {
                            for (const [key, value] of Object.entries(obj)) {
                                const newKey = prefix ? `${prefix}__${key}` : key;
                                if (value !== null && typeof value === 'object') {
                                    items.push(...flatten(value, newKey));
                                } else {
                                    items.push({ name: newKey, value: String(value) });
                                }
                            }
                        }
                        return items;
                    };

                    const flattened = flatten(data);
                    vars = flattened.map(item => ({
                        name: item.name,
                        value: item.value,
                        isSystem: false
                    }));
                }
            } else {
                // Parse as KEY=VALUE
                const lines = text.split('\n');
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) return;
                    
                    const firstEqual = trimmed.indexOf('=');
                    if (firstEqual > 0) {
                        const name = trimmed.substring(0, firstEqual).trim();
                        const value = trimmed.substring(firstEqual + 1).trim()
                                       .replace(/^['"](.*)['"]$/, '$1'); // trim quotes
                        if (name) vars.push({ name, value, isSystem: false });
                    }
                });
            }

            if (vars.length > 0) {
                this.closeImportModal();
                this.openImportReviewModal(vars);
            } else {
                showToast('No valid variables found in text', 'error');
            }
        } catch (e: any) {
            showToast('Failed to parse input. Ensure JSON is valid or use KEY=VALUE format.', 'error');
        }
    }

    openImportReviewModal(vars: EnvVar[]) {
        console.log('Opening import review for', vars.length, 'vars');
        // Transition to review phase
        (window as any).openImportReviewModal(vars);
    }

    async processImport(varsToImport: EnvVar[]) {
        showLoading(true, 'Importing variables...');
        let successCount = 0;
        let failCount = 0;

        for (const v of varsToImport) {
            const result = await window.electronAPI.createEnvVar(v.name, v.value, v.isSystem);
            if (result.success) successCount++;
            else failCount++;
        }

        await actionService.loadEnvVars();
        showLoading(false);
        showToast(`Imported ${successCount} variables, ${failCount} failed`);
    }
}

export const importService = new ImportService();
