import { $ } from '../utils.js';

export interface ExportDropdownOptions {
    id: string;
    onExport: (format: string, isMasked: boolean) => void;
    includeMask?: boolean;
    buttonClass?: string;
    label?: string;
}

export class ExportDropdown {
    private container: HTMLElement;
    private options: ExportDropdownOptions;
    private menu: HTMLElement | null = null;
    private btn: HTMLButtonElement | null = null;

    constructor(containerId: string, options: ExportDropdownOptions) {
        this.container = $(containerId);
        this.options = options;
        this.render();
        this.setupListeners();
    }

    private render() {
        const { id, buttonClass = 'btn btn-secondary', label = '📤 Export ▾', includeMask = true } = this.options;
        
        this.container.innerHTML = `
            <div class="dropdown">
                <button class="btn ${buttonClass}" id="${id}-btn">${label}</button>
                <div class="dropdown-menu" id="${id}-menu" style="display: none; top: 100%; right: 0; min-width: 160px;">
                    <div class="dropdown-item" data-format="txt">Text (.txt)</div>
                    <div class="dropdown-item" data-format="json">JSON (.json)</div>
                    <div class="dropdown-item" data-format="env">Env File (.env)</div>
                    <div class="dropdown-item" data-format="csv">CSV (.csv)</div>
                    <div class="menu-sep"></div>
                    <div class="dropdown-item" data-format="html">HTML (.html)</div>
                    <div class="dropdown-item" data-format="pdf">PDF (.pdf)</div>
                    <div class="dropdown-item" data-format="docx">Word (.docx)</div>
                    <div class="dropdown-item" data-format="script">Executable Script (.cmd/.sh)</div>
                    ${includeMask ? `
                    <div class="menu-sep"></div>
                    <div style="padding: 4px 12px; font-size: 11px;">
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <input type="checkbox" id="${id}-mask" checked /> 
                            <span>Mask Protected</span>
                        </label>
                    </div>` : ''}
                </div>
            </div>
        `;

        this.btn = $(`${id}-btn`) as HTMLButtonElement;
        this.menu = $(`${id}-menu`);
    }

    private setupListeners() {
        if (!this.btn || !this.menu) return;

        this.btn.onclick = (e) => {
            e.stopPropagation();
            this.toggle();
        };

        this.menu.querySelectorAll('.dropdown-item').forEach(el => {
            (el as HTMLElement).onclick = (e) => {
                const format = el.getAttribute('data-format');
                if (format) {
                    const isMasked = (document.getElementById(`${this.options.id}-mask`) as HTMLInputElement)?.checked ?? false;
                    this.options.onExport(format, isMasked);
                }
                this.close();
            };
        });

        // Prevent dropdown closure when interacting with the mask checkbox
        const maskContainer = this.menu.querySelector('div:last-child');
        if (maskContainer) {
            maskContainer.addEventListener('click', (e) => e.stopPropagation());
        }

        window.addEventListener('click', (e) => {
            if (this.menu && !this.btn?.contains(e.target as Node) && !this.menu.contains(e.target as Node)) {
                this.close();
            }
        });
    }

    public toggle() {
        if (this.menu) {
            const isHidden = this.menu.style.display === 'none';
            // Close all other dropdowns if needed, or rely on window click
            this.menu.style.display = isHidden ? 'block' : 'none';
        }
    }

    public close() {
        if (this.menu) this.menu.style.display = 'none';
    }
}
