import { state } from '../state.js';
import { $, escapeHtml, truncate, getVarId, MODAL_MASK, splitVarName, isPathLike, isUrlLike } from '../utils.js';
import { EnvVar } from '../types.js';
import { actionService } from '../services/ActionService.js';
import { groupingService } from '../services/GroupingService.js';

export class TableView {
    private tableBody = $('env-table-body');
    private checkAll = $('check-all') as HTMLInputElement;
    private masterCheckCount = $('master-check-count');

    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        this.checkAll.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            this.selectAll(checked);
        });
    }

    render() {
        if (!this.tableBody) return;
        this.tableBody.innerHTML = '';

        if (state.filteredVars.length === 0) {
            this.renderEmpty();
            this.updateSelectionUI();
            return;
        }

        // Apply grouping if needed
        const groupedVars = this.getGroupedData();
        
        groupedVars.forEach(item => {
            if ('vars' in item) {
                this.renderGroup(item);
            } else {
                this.renderRow(item);
            }
        });

        this.updateSelectionUI();
    }

    private renderEmpty() {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="5" class="empty-state">No variables found</td>`;
        this.tableBody.appendChild(row);
    }

    private getGroupedData() {
        const result: (EnvVar | { groupName: string, vars: EnvVar[], isCollapsed: boolean })[] = [];
        const processedVars = new Set<string>();

        // Sort groups by active column if needed
        const sortedGroupNames = Object.keys(state.groups).sort((aName, bName) => {
            if (state.sortBy === 'protected') {
                const groupA = state.groups[aName];
                const groupB = state.groups[bName];
                const protA = groupA.every(n => state.protectedVars.has(n)) ? 2 : (groupA.some(n => state.protectedVars.has(n)) ? 1 : 0);
                const protB = groupB.every(n => state.protectedVars.has(n)) ? 2 : (groupB.some(n => state.protectedVars.has(n)) ? 1 : 0);
                return state.sortOrder === 'asc' ? protA - protB : protB - protA;
            }
            if (state.sortBy === 'name') {
                return state.sortOrder === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
            }
            return 0; // Default to name or preserve order
        });

        sortedGroupNames.forEach(groupName => {
            const varNames = state.groups[groupName];
            const varsInGroup = state.filteredVars.filter(v => varNames.includes(v.name));
            
            if (varsInGroup.length > 0) {
                result.push({
                    groupName,
                    vars: varsInGroup,
                    isCollapsed: state.collapsedGroups.has(groupName)
                });
                varsInGroup.forEach(v => processedVars.add(v.name));
            }
        });

        // Add remaining variables
        state.filteredVars.forEach(v => {
            if (!processedVars.has(v.name)) {
                result.push(v);
            }
        });

        return result;
    }

    private renderGroup(group: { groupName: string, vars: EnvVar[], isCollapsed: boolean }) {
        const groupRow = document.createElement('tr');
        groupRow.className = 'group-header-row';
        groupRow.id = `group-${group.groupName}`;
        
        const allSelected = group.vars.every(v => state.selectedVars.has(v.name));
        const someSelected = !allSelected && group.vars.some(v => state.selectedVars.has(v.name));

        const allProtected = group.vars.every(v => state.protectedVars.has(v.name));
        const someProtected = !allProtected && group.vars.some(v => state.protectedVars.has(v.name));
        const anyOptimizable = group.vars.some(v => v.canOptimize);

        groupRow.innerHTML = `
            <td class="td-check">
                <input type="checkbox" class="group-checkbox" data-group="${group.groupName}" 
                    ${allSelected ? 'checked' : ''} ${someSelected ? 'class="indeterminate"' : ''} />
            </td>
            <td colspan="2" class="group-info" style="cursor: pointer;">
                <span class="group-toggle">${group.isCollapsed ? '▶' : '▼'}</span>
                <span class="group-icon">📦</span>
                <strong class="group-name">${escapeHtml(group.groupName)}</strong>
                <span class="group-count">(${group.vars.length})</span>
                ${anyOptimizable ? `
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--accent-primary)" stroke-width="2" style="margin-left: 8px;" title="Optimizable paths found">
                        <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/>
                    </svg>` : ''}
            </td>
            <td class="td-protected">
                <div style="display: flex; justify-content: center;">
                    ${allProtected ? `
                        <span title="🛡 All ${group.vars.length} variables are protected — values masked in exports. Click the shield button in Actions to unprotect all." style="display:flex;cursor:default">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#4CAF50" stroke-width="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
                            </svg>
                        </span>` : 
                      (someProtected ? `
                        <span title="⚠ Partially protected — ${group.vars.filter(v => state.protectedVars.has(v.name)).length} of ${group.vars.length} variables are protected. Use the shield button to protect all." style="display:flex;cursor:default">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FFC107" stroke-width="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </span>` : `
                        <span title="○ Unprotected — all ${group.vars.length} variables are visible. Use the shield button to protect all." style="display:flex;cursor:default">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="opacity:0.35">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            </svg>
                        </span>`)}
                </div>
            </td>
            <td class="td-actions">
                <div class="row-actions" style="display: flex; gap: 4px; justify-content: center;">
                    ${anyOptimizable ? `
                    <button class="btn-icon btn-group-optimize" data-group="${group.groupName}" title="Optimize all path variables in this group">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>
                    </button>` : ''}
                    <button class="btn-icon btn-group-toggle-protect ${allProtected ? 'protect-active' : ''}" data-group="${group.groupName}" title="${allProtected ? 'Unprotect all variables in this group' : 'Protect all variables in this group'}" style="color:${allProtected ? '#4CAF50' : 'currentColor'}">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>${allProtected ? '<path d="m9 12 2 2 4-4"/>' : ''}</svg>
                    </button>
                    <button class="btn-icon btn-group-autoprotect" data-group="${group.groupName}" title="Auto Protect — protect only variables with sensitive-looking names (passwords, keys, secrets, tokens…)">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9.5 9l1.5 1.5L14 7"/><circle cx="18" cy="5" r="3" fill="currentColor" stroke="none" opacity="0.6"/><line x1="18" y1="3.5" x2="18" y2="4.5" stroke="white" stroke-width="1"/><circle cx="18" cy="5.8" r="0.4" fill="white"/></svg>
                    </button>
                    <button class="btn-icon btn-ungroup" data-group="${group.groupName}" title="Ungroup">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18"/><path d="M3 12h5"/><path d="M16 12h5"/><path d="M3 18h18"/>
                            <line x1="11" y1="12" x2="13" y2="12" stroke-dasharray="2 2"/>
                        </svg>
                    </button>
                </div>
            </td>
        `;

        this.tableBody.appendChild(groupRow);

        if (!group.isCollapsed) {
            group.vars.forEach(v => this.renderRow(v, true));
        }

        // Listeners for group row
        groupRow.querySelector('.group-info')!.addEventListener('click', () => {
            if (state.collapsedGroups.has(group.groupName)) state.collapsedGroups.delete(group.groupName);
            else state.collapsedGroups.add(group.groupName);
            this.render();
        });

        const checkbox = groupRow.querySelector('.group-checkbox') as HTMLInputElement;
        if (someSelected) checkbox.indeterminate = true;
        checkbox.addEventListener('change', (e) => {
            this.toggleSelectGroup(group.groupName, (e.target as HTMLInputElement).checked);
        });

        const btnOpt = groupRow.querySelector('.btn-group-optimize');
        if (btnOpt) {
            btnOpt.addEventListener('click', (e) => {
                e.stopPropagation();
                const optimizableVars = group.vars.filter(v => v.canOptimize);
                Promise.all(optimizableVars.map(v => actionService.optimizeVar(v.name))).then(() => {
                    actionService.loadEnvVars();
                });
            });
        }

        groupRow.querySelector('.btn-group-toggle-protect')!.addEventListener('click', (e) => {
            e.stopPropagation();
            const names = group.vars.map(v => v.name);
            window.electronAPI.protectVars(names, !allProtected).then(() => {
                actionService.loadEnvVars(true);
            });
        });

        groupRow.querySelector('.btn-group-autoprotect')!.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { SENSITIVE_KEYWORDS } = await import('../utils.js');
            const toProtect = group.vars
                .filter(v => {
                    const upper = v.name.toUpperCase();
                    return SENSITIVE_KEYWORDS.some((k: string) => upper.includes(k)) && !state.protectedVars.has(v.name);
                })
                .map(v => v.name);
            if (toProtect.length > 0) {
                await window.electronAPI.protectVars(toProtect, true);
                await actionService.loadEnvVars(true);
                const { showToast } = await import('../utils.js');
                showToast(`Auto-protected ${toProtect.length} variable${toProtect.length !== 1 ? 's' : ''} in "${group.groupName}"`);
            } else {
                const { showToast } = await import('../utils.js');
                showToast('No additional sensitive variables found in this group', 'warning');
            }
        });


        groupRow.querySelector('.btn-ungroup')!.addEventListener('click', (e) => {
            e.stopPropagation();
            groupingService.ungroup(group.groupName);
        });
    }

    private renderRow(v: EnvVar, isInsideGroup: boolean = false) {
        const isProtected = state.protectedVars.has(v.name);
        const isRevealed = state.revealedVars.has(v.name);

        const row = document.createElement('tr');
        row.className = `var-row ${isInsideGroup ? 'row-child' : ''} ${state.selectedVars.has(v.name) ? 'selected' : ''} ${isProtected ? 'row-protected' : ''}`;
        row.dataset.id = v.name;
        
        let displayValue = v.value;
        if (isProtected && !isRevealed) {
            displayValue = MODAL_MASK;
        }

        row.innerHTML = `
            <td class="td-check">
                <input type="checkbox" class="var-checkbox" data-id="${v.name}" ${state.selectedVars.has(v.name) ? 'checked' : ''} />
            </td>
            <td class="td-name">
                <div class="name-cell">
                    <span class="var-icon">${v.isSystem ? '🖥️' : '👤'}</span>
                    <span class="var-name">${escapeHtml(v.name)}</span>
                </div>
            </td>
            <td class="td-value">
                <div class="value-cell" style="display: flex; align-items: center; gap: 4px;">
                    ${isProtected ? `
                        <button class="btn-icon btn-reveal" data-id="${v.name}" title="${isRevealed ? 'Hide' : 'Show'} value">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                    ` : ''}
                    <code class="var-value ${isProtected && !isRevealed ? 'masked' : ''}" style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${isProtected && !isRevealed ? escapeHtml(truncate(displayValue, 100)) : 
                          (isUrlLike(v.value) ? `<a href="#" class="value-link link-url" data-url="${v.value}" title="Open URL in browser">${escapeHtml(truncate(v.value, 100))}</a>` : 
                           (isPathLike(v.value) ? `<a href="#" class="value-link link-path" data-path="${v.value}" title="${v.value.includes(';') ? 'Manage multiple paths' : (v.value.endsWith('.txt') || v.value.includes('.') ? 'Open file / Show in folder' : 'Open folder in explorer')}">${escapeHtml(truncate(v.value, 100))}</a>` : 
                            escapeHtml(truncate(displayValue, 100))))}
                    </code>
                    <button class="btn-icon btn-copy-value" data-value="${v.value}" title="Copy value">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                </div>
            </td>
            <td class="td-protected">
                <div style="display: flex; justify-content: center;">
                    ${isProtected ? `
                        <span title="🛡 Protected — value is masked in exports and copies. Click the shield in Actions to unprotect." style="display:flex;cursor:default">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#4CAF50" stroke-width="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
                            </svg>
                        </span>` : `
                        <span title="○ Unprotected — value is visible. Click the shield in Actions to protect." style="display:flex;cursor:default">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="opacity:0.35">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            </svg>
                        </span>`}
                </div>
            </td>
            <td class="td-actions">
                <div class="row-actions" style="display: flex; gap: 4px; justify-content: center;">
                    <button class="btn-icon btn-copy-name" data-name="${v.name}" title="Copy name"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></button>
                    <button class="btn-icon btn-toggle-protect ${isProtected ? 'protect-active' : ''}" data-id="${v.name}" title="${isProtected ? 'Unprotect' : 'Protect'}">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${isProtected ? '#4CAF50' : 'currentColor'}" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>${isProtected ? '<path d="m9 12 2 2 4-4"/>' : ''}</svg>
                    </button>
                    <button class="btn-icon btn-clone" data-id="${v.name}" title="Clone/Duplicate"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                    ${v.canOptimize ? `
                    <button class="btn-icon btn-optimize" data-id="${v.name}" title="Optimize Path"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg></button>
                    ` : ''}
                    <button class="btn-icon btn-view-history" data-id="${v.name}" title="View history"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>
                    <button class="btn-icon btn-edit" data-id="${v.name}" title="Edit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button class="btn-icon btn-delete" data-id="${v.name}" title="Delete"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>
            </td>
        `;

        this.tableBody.appendChild(row);

        // Listeners for row
        row.querySelector('.var-checkbox')!.addEventListener('change', (e) => {
            this.toggleSelect(v.name, (e.target as HTMLInputElement).checked);
        });

        if (isProtected) {
            row.querySelector('.btn-reveal')!.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.revealedVars.has(v.name)) state.revealedVars.delete(v.name);
                else state.revealedVars.add(v.name);
                this.render();
            });
        }

        // Let renderer handle these for now via delegation or global emitter
        row.querySelector('.btn-copy-value')!.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget as HTMLButtonElement;
            const value = btn.dataset.value || '';
            navigator.clipboard.writeText(value);
            (window as any).handleCopyFeedback(btn);
        });

        row.querySelector('.btn-copy-name')!.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget as HTMLButtonElement;
            navigator.clipboard.writeText(v.name);
            (window as any).handleCopyFeedback(btn);
        });

        row.querySelector('.btn-toggle-protect')!.addEventListener('click', (e) => {
            e.stopPropagation();
            actionService.toggleProtection(v.name);
        });

        row.querySelector('.btn-clone')!.addEventListener('click', (e) => {
            e.stopPropagation();
            (window as any).openCloneModal(v);
        });

        const btnRowOpt = row.querySelector('.btn-optimize');
        if (btnRowOpt) {
            btnRowOpt.addEventListener('click', (e) => {
                e.stopPropagation();
                (window as any).openOptimizeModal(v.name);
            });
        }

        row.querySelector('.btn-view-history')!.addEventListener('click', (e) => {
            e.stopPropagation();
            (window as any).openHistoryModal(v.name);
        });

        row.querySelector('.btn-edit')!.addEventListener('click', (e) => {
            e.stopPropagation();
            (window as any).openEditModal(v);
        });

        row.querySelector('.btn-delete')!.addEventListener('click', (e) => {
            e.stopPropagation();
            (window as any).openDeleteConfirm([v.name]);
        });

        // Link opening
        row.querySelectorAll('.value-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const path = (link as HTMLElement).dataset.path;
                const url = (link as HTMLElement).dataset.url;
                
                if (path) {
                    if (path.includes(';')) {
                        // Multi-path: open the line-by-line viewer
                        (window as any).openViewModal(v);
                    } else {
                        // Single path: open normally
                        const isFile = path.includes('.') || path.endsWith('.txt') || path.includes('\\') && path.split('\\').pop()!.includes('.');
                        if (isFile) {
                            window.electronAPI.showItemInFolder(path);
                        } else {
                            window.electronAPI.openPath(path);
                        }
                    }
                } else if (url) {
                    window.electronAPI.openPath(url);
                }
            });
        });

        row.addEventListener('contextmenu', (e) => {
            (window as any).showContextMenu(e, v.name);
        });
    }

    private toggleSelect(name: string, checked: boolean) {
        if (checked) state.selectedVars.add(name);
        else state.selectedVars.delete(name);
        this.updateSelectionUI();
    }

    private toggleSelectGroup(groupName: string, checked: boolean) {
        const varNames = state.groups[groupName];
        if (!varNames) return;
        
        varNames.forEach(name => {
            if (checked) state.selectedVars.add(name);
            else state.selectedVars.delete(name);
        });
        
        this.render(); // Re-render to update child checkboxes
    }

    public selectAll(checked: boolean = true) {
        if (checked) {
            state.filteredVars.forEach(v => state.selectedVars.add(v.name));
        } else {
            state.selectedVars.clear();
        }
        this.render();
    }

    private updateSelectionUI() {
        const count = state.selectedVars.size;
        const total = state.filteredVars.length;
        
        this.checkAll.checked = total > 0 && count === total;
        this.checkAll.indeterminate = count > 0 && count < total;
        this.masterCheckCount.textContent = count > 0 ? `(${count})` : '';

        // Global UI updates (could be observable)
        (window as any).updateToolbarButtons();
    }
}
