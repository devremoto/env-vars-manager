import { state } from '../state.js';
import { $, escapeHtml, truncate, getVarById, showToast, showLoading, isPathLike, handleCopyFeedback } from '../utils.js';
import { EnvVar } from '../types.js';
import { actionService } from '../services/ActionService.js';
import { groupingService } from '../services/GroupingService.js';

export class ModalManager {
    // Edit Modal elements
    private modalOverlay = $('modal-overlay');
    private modalTitle = $('modal-title');
    private varNameInput = $('var-name-input') as HTMLInputElement;
    private varValueInput = $('var-value-input') as HTMLTextAreaElement;
    private varProtectedInput = $('var-protected-input') as HTMLInputElement;
    private modalSaveBtn = $('modal-save');
    private optimizeOverlay = $('optimize-overlay');

    // Confirm Modal
    private confirmOverlay = $('confirm-overlay');
    private confirmMessage = $('confirm-message');
    private confirmActionBtn = $('confirm-action');

    // Group Modal
    private groupModalOverlay = $('group-modal-overlay');
    private groupNameInput = $('group-name-input') as HTMLInputElement;

    // History state
    private historyData: any[] = [];
    private historySearch: string = '';
    private historyOpFilter: string = '';
    private historySortBy: string = 'timestamp';
    private historySortOrder: 'asc' | 'desc' = 'desc';
    private historySelectedIds = new Set<string>();
    private historyRevealedIds = new Set<string>();
    private currentConfirmResolve: ((val: boolean) => void) | null = null;

    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        $('modal-close').onclick = () => this.closeEditModal();
        $('modal-cancel').onclick = () => this.closeEditModal();
        $('modal-save').onclick = () => this.handleEditSave();
        
        $('confirm-cancel').onclick = () => this.closeConfirmModal();
        
        $('group-modal-close').onclick = () => this.closeGroupModal();
        $('group-modal-cancel').onclick = () => this.closeGroupModal();
        $('group-modal-save').onclick = () => this.handleGroupSave();

        $('optimize-close').onclick = () => this.closeOptimizeModal();
        $('optimize-cancel').onclick = () => this.closeOptimizeModal();
        $('optimize-apply').onclick = () => this.handleOptimizeApply();

        $('history-close').onclick = () => $('history-overlay').classList.remove('active');
        $('history-cancel').onclick = () => $('history-overlay').classList.remove('active');

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Determine which modal is active and confirm
                if (this.confirmOverlay.classList.contains('active')) {
                    this.confirmActionBtn.click();
                } else if (this.modalOverlay.classList.contains('active')) {
                    // Check if we're in the value textarea where Enter means newline
                    const active = document.activeElement as HTMLElement;
                    if (active !== this.varValueInput) {
                        this.handleEditSave();
                    }
                } else if (this.groupModalOverlay.classList.contains('active')) {
                    this.handleGroupSave();
                } else if (this.optimizeOverlay.classList.contains('active')) {
                    $('optimize-apply').click();
                }
            } else if (e.key === 'Escape') {
                // Global escape to close active modal
                if (this.confirmOverlay.classList.contains('active')) this.closeConfirmModal();
                else if (this.modalOverlay.classList.contains('active')) this.closeEditModal();
                else if (this.groupModalOverlay.classList.contains('active')) this.closeGroupModal();
                else if (this.optimizeOverlay.classList.contains('active')) this.closeOptimizeModal();
                else if ($('history-overlay').classList.contains('active')) $('history-overlay').classList.remove('active');
                else if ($('os-vars-overlay').classList.contains('active')) $('os-vars-overlay').classList.remove('active');
            }
        });
    }

    openEditModal(v?: EnvVar) {
        state.editingVar = v || null;
        this.modalTitle.textContent = v ? 'Edit Variable' : 'Create Variable';
        this.modalSaveBtn.textContent = v ? 'Save Changes' : 'Create';
        
        const isProtected = v ? state.protectedVars.has(v.name) : false;

        // Always reset UI state first — prevents bleed from previous open
        this.varValueInput.style.display = 'block';
        this.varValueInput.readOnly = false;
        this.varValueInput.style.opacity = '1';
        
        const multiContainer = $('modal-multi-value-container');
        if (multiContainer) {
            multiContainer.style.display = 'none';
            multiContainer.innerHTML = '';
        }

        const maskReset = document.getElementById('var-value-mask') as HTMLElement;
        const revealReset = document.getElementById('btn-modal-reveal') as HTMLElement;
        if (maskReset) maskReset.style.display = 'none';
        if (revealReset) revealReset.style.display = 'none';

        let displayValue = v ? v.value : '';
        const isMulti = displayValue.includes(';') && isPathLike(displayValue);

        this.varNameInput.value = v ? v.name : '';
        this.varValueInput.value = displayValue;
        this.varProtectedInput.checked = isProtected;
        this.varNameInput.disabled = !!v;

        if (isMulti && multiContainer) {
            this.varValueInput.style.display = 'none';
            multiContainer.style.display = 'flex';
            
            const parts = displayValue.split(';').map(p => p.trim()).filter(p => !!p);
            parts.forEach((p, idx) => {
                const row = document.createElement('div');
                row.className = 'multi-value-row';
                row.style.display = 'flex';
                row.style.gap = '8px';
                row.innerHTML = `
                    <input type="text" class="form-input multi-val-field" value="${escapeHtml(p)}" style="flex:1;" />
                    <button class="btn-icon btn-remove" title="Remove" style="color:var(--error-color);"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                `;
                row.querySelector('.btn-remove')?.addEventListener('click', () => {
                   row.remove();
                   if (multiContainer.children.length === 0) {
                       multiContainer.style.display = 'none';
                       this.varValueInput.style.display = 'block';
                       this.varValueInput.value = '';
                   }
                });
                multiContainer.appendChild(row);
            });

            // Add "Add Path" button
            const addBtn = document.createElement('button');
            addBtn.className = 'btn btn-secondary btn-sm';
            addBtn.style.marginTop = '8px';
            addBtn.innerHTML = '+ Add Path';
            addBtn.onclick = () => {
                const row = document.createElement('div');
                row.className = 'multi-value-row';
                row.style.display = 'flex';
                row.style.gap = '8px';
                row.innerHTML = `
                    <input type="text" class="form-input multi-val-field" placeholder="Enter path..." style="flex:1;" />
                    <button class="btn-icon btn-remove" title="Remove" style="color:var(--error-color);"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                `;
                row.querySelector('.btn-remove')?.addEventListener('click', () => row.remove());
                multiContainer.insertBefore(row, addBtn);
                (row.querySelector('input') as HTMLInputElement).focus();
            };
            multiContainer.appendChild(addBtn);
        }

        // Show/hide the value mask for protected vars
        let revealed = false;
        const applyMask = () => {
            const currentlyProtected = this.varProtectedInput.checked;
            const masked = currentlyProtected && !revealed;
            const m = document.getElementById('var-value-mask') as HTMLElement;
            const rb = document.getElementById('btn-modal-reveal') as HTMLElement;
            if (m) m.style.display = masked ? 'flex' : 'none';
            if (rb) rb.style.display = currentlyProtected ? 'block' : 'none';
            
            this.varValueInput.readOnly = masked;
            this.varValueInput.style.opacity = masked ? '0' : '1';
            if (multiContainer) multiContainer.style.opacity = masked ? '0.3' : '1';
            if (multiContainer) multiContainer.style.pointerEvents = masked ? 'none' : 'auto';
        };
        applyMask();

        const toggleReveal = () => { revealed = !revealed; applyMask(); };

        // Wire mask click and reveal button — use onXxx to avoid stacking listeners
        const liveMask = document.getElementById('var-value-mask') as HTMLElement;
        const liveReveal = document.getElementById('btn-modal-reveal') as HTMLElement;
        if (liveMask) {
            liveMask.onclick = (e) => { e.stopPropagation(); toggleReveal(); };
            liveMask.title = 'Click to reveal value and unlock editing';
        }
        if (liveReveal) {
            liveReveal.onclick = (e) => { e.stopPropagation(); toggleReveal(); };
        }

        // When protection checkbox changes, recompute mask
        this.varProtectedInput.onchange = () => { applyMask(); };

        this.modalOverlay.classList.add('active');
        setTimeout(() => {
            if (isProtected) {
                document.getElementById('btn-modal-reveal')?.focus();
            } else {
                this.varValueInput.focus();
            }
        }, 50);
    }

    openCloneModal(v: EnvVar) {
        // Clone: pre-fill with the original values but as a NEW variable (no editingVar set)
        state.editingVar = null;
        this.modalTitle.textContent = 'Clone Variable';
        this.modalSaveBtn.textContent = 'Create Clone';
        
        this.varNameInput.value = v.name + '_copy';
        this.varValueInput.value = v.value;
        this.varProtectedInput.checked = state.protectedVars.has(v.name);
        
        this.varNameInput.disabled = false; // Allow renaming the clone
        this.modalOverlay.classList.add('active');
        this.varNameInput.focus();
        this.varNameInput.select();
    }

    closeEditModal() {
        this.modalOverlay.classList.remove('active');
        state.editingVar = null;
        // Always clean up — so next open starts fresh
        this.varValueInput.readOnly = false;
        this.varValueInput.style.opacity = '1';
        this.varProtectedInput.onchange = null;
        const mask = document.getElementById('var-value-mask') as HTMLElement;
        const revealBtn = document.getElementById('btn-modal-reveal') as HTMLElement;
        if (mask) mask.style.display = 'none';
        if (revealBtn) revealBtn.style.display = 'none';
    }

    private async handleEditSave() {
        const name = this.varNameInput.value.trim();
        const isProtected = this.varProtectedInput.checked;
        const multiContainer = $('modal-multi-value-container');
        
        let value = '';
        if (multiContainer && multiContainer.style.display === 'flex') {
            const fields = multiContainer.querySelectorAll('.multi-val-field') as NodeListOf<HTMLInputElement>;
            value = Array.from(fields).map(f => f.value.trim()).filter(v => !!v).join(';');
        } else {
            value = this.varValueInput.value.trim();
        }
        
        if (!name) {
            showToast('Name is required', 'error');
            return;
        }

        const success = await actionService.saveVariable(name, value, false);
        if (success) {
            if (isProtected) {
                await window.electronAPI.protectVars([name], true);
            } else {
                await window.electronAPI.protectVars([name], false);
            }
            this.closeEditModal();
            await actionService.loadEnvVars(true);
        }
    }

    openConfirmModal(message: string, onConfirm: () => void) {
        this.confirmMessage.textContent = message;
        this.confirmActionBtn.onclick = () => {
            onConfirm();
            this.closeConfirmModal();
        };
        this.confirmOverlay.classList.add('active');
    }

    closeConfirmModal() {
        this.confirmOverlay.classList.remove('active');
        if (this.currentConfirmResolve) {
            this.currentConfirmResolve(false);
            this.currentConfirmResolve = null;
        }
    }

    public confirm(message: string): Promise<boolean> {
        return new Promise((resolve) => {
            if (this.currentConfirmResolve) {
                // Resolve previous if any (shouldn't happen with modals)
                this.currentConfirmResolve(false);
            }
            this.currentConfirmResolve = resolve;
            
            this.confirmMessage.textContent = message;
            
            this.confirmActionBtn.onclick = () => {
                this.confirmOverlay.classList.remove('active');
                this.currentConfirmResolve = null;
                resolve(true);
            };

            const cancelBtn = this.confirmOverlay.querySelector('#confirm-cancel') as HTMLElement;
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    this.closeConfirmModal();
                };
            }

            this.confirmOverlay.classList.add('active');
        });
    }

    openGroupModal() {
        const count = state.selectedVars.size;
        if (count < 2) {
            showToast('Select at least 2 variables to group', 'warning');
            return;
        }
        $('group-modal-count').textContent = count.toString();
        this.groupNameInput.value = '';
        this.groupModalOverlay.classList.add('active');
        this.groupNameInput.focus();
    }

    closeGroupModal() {
        this.groupModalOverlay.classList.remove('active');
    }

    private async handleGroupSave() {
        const name = this.groupNameInput.value.trim();
        if (!name) {
            showToast('Group name is required', 'error');
            return;
        }
        await groupingService.createGroupFromSelection(name);
        this.closeGroupModal();
    }

    async openOptimizeModal(name: string) {
        const v = getVarById(name);
        if (!v) return;

        showLoading(true);
        try {
            const result = await (window as any).electronAPI.optimizeVar(name, v.value);
            if (result.success && result.savings > 0) {
                // Use IDs from the more detailed modal at line 740
                const origEl = $('optimize-original');
                const newEl = $('optimize-new');
                const origCountEl = $('optimize-original-count');
                const newCountEl = $('optimize-new-count');
                const redValEl = $('optimize-reduction-value');
                const redPercEl = $('optimize-reduction-percent');

                if (origEl) origEl.textContent = v.value;
                if (newEl) newEl.textContent = result.optimized;
                if (origCountEl) origCountEl.textContent = v.value.length.toString();
                if (newCountEl) newCountEl.textContent = result.optimized.length.toString();
                if (redValEl) redValEl.textContent = result.savings.toString();
                
                const percent = Math.round((result.savings / v.value.length) * 100);
                if (redPercEl) redPercEl.textContent = percent.toString();

                // Store for apply
                (this as any)._currentOptimizeVar = { name, value: result.optimized };
                
                this.optimizeOverlay.classList.add('active');
            } else {
                showToast(result.error || 'No optimization possible', 'warning');
            }
        } catch (err: any) {
            showToast('Failed to get optimization preview', 'error');
        } finally {
            showLoading(false);
        }
    }

    closeOptimizeModal() {
        this.optimizeOverlay.classList.remove('active');
    }

    private async handleOptimizeApply() {
        const data = (this as any)._currentOptimizeVar;
        if (data && data.name && data.value) {
            const success = await actionService.saveVariable(data.name, data.value);
            if (success) {
                showToast(`Optimized ${data.name} successfully`);
                this.closeOptimizeModal();
            }
        }
    }

    async openImportReviewModal(vars: EnvVar[]) {
        const overlay = $('import-review-modal-overlay');
        const newList = $('import-review-new-list');
        const existingList = $('import-review-existing-list');
        const newCountEl = $('import-review-new-count');
        const existingCountEl = $('import-review-existing-count');
        const btnConfirm = $('import-review-confirm');
        const btnCancel = $('import-review-cancel');
        const btnClose = $('import-review-modal-close');
        const btnReveal = $('btn-import-review-reveal');
        
        const prefixInput = $('import-prefix-input') as HTMLInputElement;
        const groupByPrefixCheck = $('import-group-by-prefix') as HTMLInputElement;
        const newSelectAll = $('import-new-select-all') as HTMLInputElement;
        const existingSelectAll = $('import-existing-select-all') as HTMLInputElement;

        let isRevealed = false;
        let prefix = '';

        if (prefixInput) {
            prefixInput.value = '';
            prefixInput.oninput = () => {
                prefix = prefixInput.value.trim();
                renderLists();
            };
        }
        
        if (newSelectAll) {
            newSelectAll.checked = true;
            newSelectAll.onchange = () => {
                const checks = newList.querySelectorAll('.import-new-check') as NodeListOf<HTMLInputElement>;
                checks.forEach(c => c.checked = newSelectAll.checked);
            };
        }

        if (existingSelectAll) {
            existingSelectAll.checked = true;
            existingSelectAll.onchange = () => {
                const checks = existingList.querySelectorAll('.import-overwrite-check') as NodeListOf<HTMLInputElement>;
                checks.forEach(c => c.checked = existingSelectAll.checked);
            };
        }

        const renderLists = () => {
            newList.innerHTML = '';
            existingList.innerHTML = '';
            
            const p = prefix ? `${prefix}__` : '';
            
            const newVars = vars.filter(v => !state.allEnvVars.some(ev => ev.name === (p + v.name)));
            const existingVars = vars.filter(v => state.allEnvVars.some(ev => ev.name === (p + v.name)));

            newCountEl.textContent = newVars.length.toString();
            existingCountEl.textContent = existingVars.length.toString();

            newVars.forEach(v => {
                const item = document.createElement('div');
                item.className = 'import-review-item';
                item.style.padding = '4px 8px';
                item.style.fontSize = '12px';
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '8px';
                
                const finalName = p + v.name;
                const displayVal = isRevealed ? escapeHtml(v.value) : '********';
                const blurStyle = isRevealed ? '' : 'filter:blur(3px); opacity:0.5;';

                item.innerHTML = `
                    <input type="checkbox" checked class="import-new-check" data-original-name="${v.name}" />
                    <div style="flex:1">
                        <strong>${finalName}</strong>: <span class="review-val" style="${blurStyle}">${displayVal}</span>
                    </div>
                `;
                newList.appendChild(item);
            });

            existingVars.forEach(v => {
                const item = document.createElement('div');
                item.className = 'import-review-item-conflict';
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '8px';
                item.style.padding = '6px 8px';
                item.style.background = 'rgba(255, 152, 0, 0.05)';
                item.style.border = '1px solid rgba(255, 152, 0, 0.2)';
                item.style.borderRadius = '4px';
                
                const finalName = p + v.name;
                const displayVal = isRevealed ? escapeHtml(v.value) : '********';
                const blurStyle = isRevealed ? '' : 'filter:blur(3px); opacity:0.5;';
                
                item.innerHTML = `
                    <input type="checkbox" checked class="import-overwrite-check" data-original-name="${v.name}" />
                    <div style="flex:1">
                        <div style="font-weight:bold; font-size:12px; color:var(--warning)">${finalName}</div>
                        <div style="font-size:11px; opacity:0.8; margin-top: 2px" class="review-val">
                           <span style="${blurStyle}">New: ${displayVal}</span>
                        </div>
                    </div>
                `;
                existingList.appendChild(item);
            });

            $('import-review-no-new').style.display = newVars.length === 0 ? 'block' : 'none';
            $('import-review-no-existing').style.display = existingVars.length === 0 ? 'block' : 'none';
        };

        renderLists();
        overlay.classList.add('active');

        if (btnReveal) {
            btnReveal.onclick = () => {
                isRevealed = !isRevealed;
                const label = $('import-review-reveal-label');
                if (label) label.textContent = isRevealed ? 'Hide' : 'Reveal';
                renderLists();
            };
        }

        const close = () => overlay.classList.remove('active');
        btnCancel.onclick = close;
        btnClose.onclick = close;

        btnConfirm.onclick = async () => {
            const p = prefix ? `${prefix}__` : '';
            const shouldGroup = groupByPrefixCheck?.checked && prefix;
            
            const newChecks = newList.querySelectorAll('.import-new-check:checked');
            const overwriteChecks = existingList.querySelectorAll('.import-overwrite-check:checked');
            
            const toImport: EnvVar[] = [];
            
            newChecks.forEach(c => {
                const origName = (c as HTMLInputElement).dataset.originalName;
                const v = vars.find(x => x.name === origName);
                if (v) toImport.push({ ...v, name: p + v.name });
            });
            
            overwriteChecks.forEach(c => {
                const origName = (c as HTMLInputElement).dataset.originalName;
                const v = vars.find(x => x.name === origName);
                if (v) toImport.push({ ...v, name: p + v.name });
            });

            if (toImport.length > 0) {
                const { importService } = await import('../services/ImportService.js');
                await importService.processImport(toImport);
                
                if (shouldGroup) {
                    const names = toImport.map(v => v.name);
                    const { groupingService } = await import('../services/GroupingService.js');
                    await groupingService.createGroupFromList(prefix, names);
                }
            }
            close();
        };
    }

    async openHistoryModal(varName?: string) {
        const overlay = $('history-overlay');
        const list = $('history-list');
        const title = $('history-modal-title');
        const closeBtn = $('history-modal-close');
        const cancelBtn = $('history-modal-cancel');
        const searchInput = $('history-search') as HTMLInputElement;
        const opFilter = $('history-op-filter') as HTMLSelectElement;

        const close = () => overlay.classList.remove('active');
        closeBtn.onclick = close;
        cancelBtn.onclick = close;

        title.textContent = varName ? `History for ${varName}` : 'All Variable History';
        list.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-secondary);">Loading history logs...</div>';
        overlay.classList.add('active');

        // Reset filters
        this.historySearch = '';
        this.historyOpFilter = '';
        this.historySortBy = 'timestamp';
        this.historySortOrder = 'desc';
        this.historySelectedIds.clear();
        this.historyRevealedIds.clear();

        if (searchInput) searchInput.value = '';
        if (opFilter) opFilter.value = '';

        const selectAll = $('history-select-all') as HTMLInputElement;
        if (selectAll) {
            selectAll.checked = false;
            selectAll.onclick = () => this.toggleHistorySelectionAll(selectAll.checked);
        }

        const btnDeleteBulk = $('btn-history-delete-bulk');
        if (btnDeleteBulk) {
            btnDeleteBulk.style.display = 'none';
            btnDeleteBulk.onclick = () => this.handleHistoryDelete([...this.historySelectedIds]);
        }

        try {
            this.historyData = await window.electronAPI.getVarHistory(varName);
            
            // Wire listeners
            if (searchInput) {
                searchInput.oninput = () => {
                    this.historySearch = searchInput.value.toLowerCase();
                    this.renderHistory();
                };
            }
            if (opFilter) {
                opFilter.onchange = () => {
                    this.historyOpFilter = opFilter.value;
                    this.renderHistory();
                };
            }
            
            document.querySelectorAll('.history-sort-col').forEach(el => {
                const col = (el as HTMLElement).dataset.sort!;
                (el as HTMLElement).onclick = () => {
                   if (this.historySortBy === col) {
                       this.historySortOrder = this.historySortOrder === 'asc' ? 'desc' : 'asc';
                   } else {
                       this.historySortBy = col;
                       this.historySortOrder = col === 'timestamp' ? 'desc' : 'asc';
                   }
                   this.updateHistorySortUI();
                   this.renderHistory();
                };
            });

            this.updateHistorySortUI();
            this.renderHistory();

        } catch (err) {
            list.innerHTML = `<div style="padding:40px; text-align:center; color:var(--error-color);">Failed to load history: ${err}</div>`;
        }
    }

    private updateHistorySortUI() {
        document.querySelectorAll('.history-sort-col').forEach(el => {
            const col = (el as HTMLElement).dataset.sort;
            const icon = el.querySelector('.sort-icon') as HTMLElement;
            if (col === this.historySortBy) {
                el.classList.add('active-sort');
                if (icon) icon.textContent = this.historySortOrder === 'asc' ? '↑' : '↓';
                (el as HTMLElement).style.color = 'var(--accent-primary)';
            } else {
                el.classList.remove('active-sort');
                if (icon) icon.textContent = '↕';
                (el as HTMLElement).style.color = 'var(--text-muted)';
            }
        });
    }

    private renderHistory() {
        const list = $('history-list');
        const overlay = $('history-overlay');
        
        // Filter
        let filtered = this.historyData.filter(item => {
            const matchesSearch = !this.historySearch || 
                item.variable_name.toLowerCase().includes(this.historySearch) ||
                (item.old_value || '').toLowerCase().includes(this.historySearch) ||
                (item.new_value || '').toLowerCase().includes(this.historySearch);
                
            const matchesOp = !this.historyOpFilter || item.operation === this.historyOpFilter;
            
            return matchesSearch && matchesOp;
        });

        // Sort
        filtered.sort((a, b) => {
            let vA = a[this.historySortBy] || '';
            let vB = b[this.historySortBy] || '';
            
            if (this.historySortBy === 'timestamp') {
                vA = new Date(vA).getTime();
                vB = new Date(vB).getTime();
            } else {
                vA = String(vA).toLowerCase();
                vB = String(vB).toLowerCase();
            }

            if (vA < vB) return this.historySortOrder === 'asc' ? -1 : 1;
            if (vA > vB) return this.historySortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        list.innerHTML = '';
        if (filtered.length === 0) {
            list.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-secondary);">No matching history found.</div>';
            return;
        }

        filtered.forEach(item => {
            const row = document.createElement('div');
            // Column layout: Checkbox, Operation, Name (+ Badge), Timestamp, Value Change, Actions
            row.style.cssText = 'display:grid; grid-template-columns: 40px 60px 140px 130px 1fr 100px; gap:12px; padding:12px 24px; border-bottom:1px solid var(--border-default); align-items:center; transition:0.2s;';
            
            const isSelected = this.historySelectedIds.has(item.id);
            if (isSelected) row.style.background = 'rgba(124, 106, 255, 0.05)';

            const timestamp = new Date(item.timestamp).toLocaleString();
            const opColor = item.operation === 'CREATE' ? 'var(--success)' : 
                           (item.operation === 'DELETE' ? 'var(--error)' : 
                           (item.operation === 'PROTECT' || item.operation === 'UNPROTECT' ? 'var(--warning)' : 'var(--accent-primary)'));
            const protectionBadge = item.was_protected ? '<span style="color:var(--error); font-size:9px; font-weight:bold; margin-left:6px; letter-spacing:0.05em; vertical-align:middle;">[PROTECTED]</span>' : '';
            
            const isRevealed = this.historyRevealedIds.has(item.id);
            const mask = '••••••••';
            
            const renderValue = (val: string | null) => {
                if (!val) return '';
                if (item.was_protected && !isRevealed) return mask;
                return val;
            };

            let valueChange = '';
            if (item.operation === 'CREATE') {
                valueChange = `<span style="color:var(--success);">Created with:</span> <code style="font-size:11px; white-space:pre-wrap; word-break:break-all;">${escapeHtml(renderValue(item.new_value))}</code>`;
            } else if (item.operation === 'DELETE') {
                valueChange = `<span style="color:var(--error);">Deleted (was:</span> <code style="font-size:11px; white-space:pre-wrap; word-break:break-all;">${escapeHtml(renderValue(item.old_value))}</code>)`;
            } else if (item.operation === 'PROTECT' || item.operation === 'UNPROTECT') {
                const action = item.operation === 'PROTECT' ? 'Protected' : 'Unprotected';
                const color = item.operation === 'PROTECT' ? 'var(--error)' : 'var(--success)';
                valueChange = `<span style="color:${color}; font-weight:600;">${action}</span> the variable <code style="font-size:11px; white-space:pre-wrap; word-break:break-all;">${escapeHtml(renderValue(item.new_value))}</code>`;
            } else {
                const oldVal = renderValue(item.old_value);
                const newVal = renderValue(item.new_value);
                const isSameValue = item.old_value === item.new_value;
                
                if (isSameValue) {
                    valueChange = `<div style="font-size:11px; color:var(--text-muted);"><span style="color:var(--warning); font-weight:600;">Security Change:</span> Protection status modified for <code style="white-space:pre-wrap; word-break:break-all;">${escapeHtml(newVal)}</code></div>`;
                } else {
                    valueChange = `
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <div style="font-size:11px; color:var(--text-muted); text-decoration:line-through; white-space:pre-wrap; word-break:break-all;">${escapeHtml(oldVal)}</div>
                            <div style="font-size:11px; color:var(--text-primary); font-weight:500; white-space:pre-wrap; word-break:break-all;">${escapeHtml(newVal)}</div>
                        </div>
                    `;
                }
            }

            const revealIcon = isRevealed ? '🫣' : '👁️';
            const revealBtn = item.was_protected ? `<button class="btn-icon btn-xs btn-history-reveal" data-id="${item.id}" title="${isRevealed ? 'Hide' : 'Reveal'} value" style="margin-left: 8px;">${revealIcon}</button>` : '';

            const currentVar = state.allEnvVars.find(v => v.name === item.variable_name);
            const currentValue = currentVar ? currentVar.value : null;
            const currentProtection = state.protectedVars.has(item.variable_name);
            
            let targetValue: string | null = null;
            if (item.operation === 'CREATE') {
                targetValue = item.new_value;
            } else if (['UPDATE', 'OPTIMIZE', 'DELETE', 'PROTECT', 'UNPROTECT'].includes(item.operation)) {
                targetValue = item.old_value;
            }

            const isStateDifferent = targetValue !== currentValue || !!item.was_protected !== currentProtection;
            const canRestore = item.operation !== 'RESTORE' && targetValue !== null && isStateDifferent;
            const restoreBtn = canRestore ? `<button class="btn btn-secondary btn-xs btn-restore" data-id="${item.id}" title="Restore this version">Restore</button>` : '';

            row.innerHTML = `
                <span><input type="checkbox" class="history-item-check" data-id="${item.id}" ${isSelected ? 'checked' : ''} /></span>
                <span style="color:${opColor}; font-weight:600; font-size:11px;">${item.operation}</span>
                <div style="display:flex; align-items:center; overflow:hidden;">
                    <span style="font-weight:500; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.variable_name}">${item.variable_name}</span>
                    ${protectionBadge}
                </div>
                <span style="font-size:11px; color:var(--text-muted);">${timestamp}</span>
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                    <div style="flex:1; overflow:hidden;">${valueChange}</div>
                    ${revealBtn}
                </div>
                <div style="text-align:right; display:flex; gap:8px; justify-content:flex-end;">
                    ${restoreBtn}
                    <button class="btn-icon btn-xs btn-history-delete" data-id="${item.id}" title="Delete this entry" style="color:var(--text-muted); hover:var(--error);">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            `;

            row.querySelector('.history-item-check')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleHistorySelection(item.id, (e.target as HTMLInputElement).checked);
            });

            row.querySelector('.btn-restore')?.addEventListener('click', () => {
                const label = item.operation === 'DELETE' ? `bring back ${item.variable_name}?` : `restore ${item.variable_name} to this value?`;
                this.openConfirmModal(`Restore will ${label}`, async () => {
                    const res = await window.electronAPI.restoreVar(item.id);
                    if (res.success) {
                        showToast(`${item.variable_name} restored!`, 'success');
                        overlay.classList.remove('active');
                        await actionService.loadEnvVars(true);
                    } else {
                        showToast(`Restore failed: ${res.error}`, 'error');
                    }
                });
            });

            row.querySelector('.btn-history-reveal')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.historyRevealedIds.has(item.id)) this.historyRevealedIds.delete(item.id);
                else this.historyRevealedIds.add(item.id);
                this.renderHistory();
            });

            row.querySelector('.btn-history-delete')?.addEventListener('click', () => {
                this.handleHistoryDelete([item.id]);
            });

            list.appendChild(row);
        });

        this.updateHistoryToolbar();
    }

    private toggleHistorySelection(id: string, selected: boolean) {
        if (selected) this.historySelectedIds.add(id);
        else this.historySelectedIds.delete(id);
        
        // Update Select All state
        const allChecks = document.querySelectorAll('.history-item-check') as NodeListOf<HTMLInputElement>;
        const selectAll = $('history-select-all') as HTMLInputElement;
        if (selectAll) {
            const allChecked = Array.from(allChecks).every(c => c.checked);
            const someChecked = Array.from(allChecks).some(c => c.checked);
            selectAll.checked = allChecked;
            selectAll.indeterminate = someChecked && !allChecked;
        }
        
        this.updateHistoryToolbar();
    }

    private toggleHistorySelectionAll(selected: boolean) {
        const checks = document.querySelectorAll('.history-item-check') as NodeListOf<HTMLInputElement>;
        checks.forEach(c => {
            const id = c.dataset.id!;
            c.checked = selected;
            if (selected) this.historySelectedIds.add(id);
            else this.historySelectedIds.delete(id);
        });
        this.updateHistoryToolbar();
    }

    private updateHistoryToolbar() {
        const count = this.historySelectedIds.size;
        const btnDelete = $('btn-history-delete-bulk');
        const countEl = $('history-selection-count');
        
        if (btnDelete && countEl) {
            btnDelete.style.display = count > 0 ? 'flex' : 'none';
            countEl.textContent = count > 1 ? `(${count})` : '';
        }
    }

    private async handleHistoryDelete(ids: string[]) {
        if (ids.length === 0) return;
        
        const message = ids.length === 1 
            ? "Are you sure you want to delete this history log entry?" 
            : `Are you sure you want to delete ${ids.length} history log entries?`;
            
        this.openConfirmModal(message, async () => {
            const res = await window.electronAPI.deleteHistory(ids);
            if (res.success) {
                showToast(ids.length === 1 ? 'History entry deleted' : `${ids.length} entries deleted`);
                // Remove from local data and render
                this.historyData = this.historyData.filter(h => !ids.includes(h.id));
                ids.forEach(id => this.historySelectedIds.delete(id));
                this.renderHistory();
            } else {
                showToast(`Failed to delete: ${res.error}`, 'error');
            }
        });
    }

    openViewModal(v: EnvVar) {
        const overlay = $('view-value-overlay');
        const title = $('view-value-title');
        const nameLabel = $('view-value-name-label');
        const content = $('view-value-content') as HTMLTextAreaElement;
        const gridContainer = $('view-value-grid-container');
        const grid = $('view-value-grid');
        
        const closeBtn = $('view-value-close');
        const cancelBtn = $('view-value-cancel');
        const copyBtn = $('view-value-copy');

        const close = () => overlay.classList.remove('active');
        closeBtn.onclick = close;
        cancelBtn.onclick = close;
        
        title.textContent = v.name;
        nameLabel.textContent = `Value of ${v.name}`;

        const isProtected = state.protectedVars.has(v.name);
        const displayValue = isProtected ? '********' : v.value;

        copyBtn.onclick = (e) => {
            navigator.clipboard.writeText(v.value);
            handleCopyFeedback(e.currentTarget as HTMLButtonElement);
        };

        if (v.value.includes(';') && isPathLike(v.value)) {
            content.style.display = 'none';
            gridContainer.style.display = 'flex';
            grid.innerHTML = '';
            
            v.value.split(';').map(p => p.trim()).filter(p => !!p).forEach(p => {
                const row = document.createElement('div');
                row.className = 'multi-path-row';
                row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px; background:var(--bg-tertiary); border:1px solid var(--border-default); border-radius:4px; transition:0.2s;';
                
                row.innerHTML = `
                    <div style="flex:1; overflow:hidden; text-overflow:ellipsis; font-family:var(--font-mono); font-size:12px; color:var(--text-primary);">
                        ${escapeHtml(p)}
                    </div>
                    <button class="btn-icon btn-open-sub" title="Open in Explorer">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </button>
                `;
                
                row.querySelector('.btn-open-sub')!.addEventListener('click', () => {
                    const isFile = p.includes('.') || p.endsWith('.txt');
                    if (isFile) window.electronAPI.showItemInFolder(p);
                    else window.electronAPI.openPath(p);
                });
                
                grid.appendChild(row);
            });
        } else {
            content.style.display = 'block';
            gridContainer.style.display = 'none';
            content.value = displayValue;
        }

        overlay.classList.add('active');
    }
    async openOsVarsModal() {
        const overlay = $('os-vars-overlay');
        const list = $('os-vars-list');
        const closeBtn = $('os-vars-close');
        const cancelBtn = $('os-vars-cancel');

        const close = () => overlay.classList.remove('active');
        closeBtn.onclick = close;
        cancelBtn.onclick = close;

        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-secondary);">Loading system variables...</div>';
        overlay.classList.add('active');

        try {
            const categories = await window.electronAPI.getOsVars() as any as Record<string, Record<string, string>>;
            list.innerHTML = '';
            
            Object.keys(categories).forEach(cat => {
                const vars = categories[cat];
                const sortedKeys = Object.keys(vars).sort();
                
                if (sortedKeys.length > 0) {
                    const header = document.createElement('div');
                    header.style.cssText = 'padding:14px 20px; background:var(--bg-tertiary); font-weight:700; font-size:11px; color:var(--accent-primary); text-transform:uppercase; letter-spacing:0.1em; border-bottom:1px solid var(--border-default);';
                    header.textContent = cat;
                    list.appendChild(header);

                    sortedKeys.forEach(key => {
                        const item = document.createElement('div');
                        item.style.cssText = 'padding:12px 20px; border-bottom:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:4px;';
                        item.innerHTML = `
                            <div style="font-weight:600; color:var(--accent-primary); font-size:12px;">${escapeHtml(key)}</div>
                            <div style="font-family:var(--font-mono); font-size:11px; word-break:break-all; color:var(--text-primary); opacity:0.85;">${escapeHtml(vars[key])}</div>
                        `;
                        list.appendChild(item);
                    });
                }
            });

            if (list.innerHTML === '') {
                list.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-secondary);">No system variables found in Registry.</div>';
            }
        } catch (err: any) {
            list.innerHTML = `<div style="padding:40px; text-align:center; color:var(--error-color);">Failed to load Registry variables: ${err.message}</div>`;
        }
    }

    openScriptExportModal(vars: any[], isMasked: boolean) {
        const overlay = $('script-export-overlay');
        if (!overlay) return;
        
        const preview = $('script-export-preview');
        const closeBtn = $('script-export-close');
        const cancelBtn = $('script-export-cancel');
        const saveBtn = $('script-export-save');
        const modeButtons = overlay.querySelectorAll('.export-mode-btn');
        
        let currentMode = 'standard';

        const updatePreview = () => {
            const sample = vars.slice(0, 3);
            let text = '';
            const isWin = navigator.userAgent.toLowerCase().includes('win');
            const githubOptions = $('github-options-container');
            const githubInput = $('github-repo-input') as HTMLInputElement;

            if (githubOptions) {
                githubOptions.style.display = currentMode === 'github' ? 'block' : 'none';
            }

            const repo = githubInput?.value || '';
            const repoFlag = repo ? ` --repo ${repo}` : '';
            
            if (currentMode === 'github') {
                text += `echo Y | gh auth login --web --git-protocol https\n\n`;
            }

            sample.forEach(v => {
                const val = (v.isProtected && isMasked) ? '********' : v.value;
                if (currentMode === 'standard') {
                    text += isWin ? `set ${v.name}=${val}\n` : `export ${v.name}="${val}"\n`;
                } else if (currentMode === 'aws') {
                    text += `export AWS_${v.name.toUpperCase()}="${val}"\n`;
                } else if (currentMode === 'azure') {
                    text += `az configure --defaults ${v.name}="${val}"\n`;
                } else if (currentMode === 'terraform') {
                    text += `export TF_VAR_${v.name.toLowerCase()}="${val}"\n`;
                } else if (currentMode === 'github') {
                    text += `gh secret set ${v.name} -b"${val}"${repoFlag}\n`;
                }
            });

            // Add pause to preview (unless it's terraform-style)
            if (currentMode !== 'terraform') {
                text += '\n';
                if (isWin) {
                    text += `pause\n`;
                } else {
                    text += `read -p "Press any key to continue..."\n`;
                }
            }

            if (vars.length > 3) text += `# ... and ${vars.length - 3} more`;
            if (preview) preview.textContent = text;
        };

        const githubRepoInput = $('github-repo-input');
        if (githubRepoInput) {
            githubRepoInput.oninput = updatePreview;
        }

        modeButtons.forEach(btn => {
            (btn as HTMLElement).onclick = () => {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentMode = (btn as HTMLElement).dataset.mode!;
                updatePreview();
            };
        });

        const close = () => overlay.classList.remove('active');
        if (closeBtn) closeBtn.onclick = close;
        if (cancelBtn) cancelBtn.onclick = close;
        
        if (saveBtn) {
            saveBtn.onclick = async () => {
                const githubRepo = (document.getElementById('github-repo-input') as HTMLInputElement)?.value || '';
                const res = await window.electronAPI.exportEnvVars(vars, 'script', isMasked, currentMode, githubRepo);
                if (res.success) {
                    showToast('Script exported successfully');
                    close();
                } else if (res.error !== 'cancelled') {
                    showToast(`Export failed: ${res.error}`, 'error');
                }
            };
        }

        updatePreview();
        overlay.classList.add('active');
    }
}
