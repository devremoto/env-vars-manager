import { EnvVar } from './types.js';
import { state } from './state.js';

export const $ = (id: string) => {
    const el = document.getElementById(id);
    if (!el) console.error(`DOM ERROR: Element with id "${id}" not found.`);
    return el!;
};
export const $$ = (selector: string) => {
    const el = document.querySelector(selector) as HTMLElement;
    if (!el) console.error(`DOM ERROR: Selector "${selector}" not found.`);
    return el;
};

export function debugLog(msg: string) {
    // Debug panel removed by request
}

export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function truncate(str: string, max: number): string {
    return str && str.length > max ? str.substring(0, max) + '...' : str;
}

export function isPathLike(value: string): boolean {
    if (!value) return false;
    const parts = value.split(/[;:]/).filter(p => !!p);
    if (parts.length === 0) return false;
    const pathRegex = /^[a-zA-Z]:\\|^[/\\]|^%.+%.*|^[\$][a-zA-Z_].*/;
    return parts.some(p => !!p.trim().match(pathRegex));
}

export const MODAL_MASK = '********';

/**
 * Checks if a variable is protected (case-insensitive)
 */
export function isProtected(name: string): boolean {
    if (!name) return false;
    const nameUpper = name.toUpperCase();
    return Array.from(state.protectedVars).some(v => v.toUpperCase() === nameUpper);
}

/**
 * Returns masked value if protected and not revealed
 */
export function getMaskedValue(name: string, value: string, isRevealed: boolean = false): string {
    return (isProtected(name) && !isRevealed) ? MODAL_MASK : value;
}

export function isUrlLike(value: string): boolean {
    if (!value) return false;
    const parts = value.split(/[; ]/).filter(p => !!p);
    const urlRegex = /^https?:\/\//i;
    return parts.some(p => !!p.trim().match(urlRegex));
}

export const getVarId = (v: EnvVar) => v.name;
export const getVarById = (name: string) => state.allEnvVars.find(v => v.name === name);

export function splitVarName(name: string): string[] {
    // Treat only __ and : as separators.
    return name.split(/__|:/).filter(p => !!p);
}

export function showLoading(show: boolean, message: string = 'Loading variables...'): void {
    const indicator = $('loading-indicator');
    const span = indicator.querySelector('span');
    if (span) span.textContent = message;
    indicator.style.display = show ? 'flex' : 'none';
}

export function showToast(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    const container = $('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = '🔔';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            if (toast.parentNode) container.removeChild(toast);
        }, 500);
    }, 4000);
}

const CHECK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';

export function handleCopyFeedback(btn: HTMLButtonElement): void {
    const originalContent = btn.innerHTML;
    btn.innerHTML = CHECK_SVG;
    btn.classList.add('copy-success');
    btn.style.color = 'var(--success)';

    setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.classList.remove('copy-success');
        btn.style.color = '';
    }, 1500);
}

export const SENSITIVE_KEYWORDS = ['KEY', 'SECRET', 'PASS', 'TOKEN', 'AUTH', 'CLIENTID', 'CLIENT_ID', 'LICENCE', 'LICENSE'];
