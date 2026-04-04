import { state } from './state.js';
import { $, showToast, debugLog, splitVarName, handleCopyFeedback, getVarById } from './utils.js';
import { actionService } from './services/ActionService.js';
import { groupingService } from './services/GroupingService.js';
import { clipboardService } from './services/ClipboardService.js';
import { importService } from './services/ImportService.js';
import { ExportDropdown } from './ui-components/ExportDropdown.js';
import { TableView } from './ui-components/TableView.js';
import { Explorer } from './ui-components/Explorer.js';
import { ModalManager } from './ui-components/ModalManager.js';
import { ContextMenu } from './ui-components/ContextMenu.js';

export class MainRenderer {
    private tableView: TableView;
    private explorer: Explorer;
    private modalManager: ModalManager;
    private contextMenu: ContextMenu;

    constructor() {
        debugLog('MainRenderer starting...');
        this.tableView = new TableView();
        debugLog('TableView initialized');
        this.explorer = new Explorer();
        debugLog('Explorer initialized');
        this.modalManager = new ModalManager();
        actionService.setModalManager(this.modalManager);
        debugLog('ModalManager initialized');
        this.contextMenu = new ContextMenu();
        debugLog('ContextMenu initialized');

        // Register globals for cross-component calls (temp during refactor)
        (window as any).explorer = this.explorer;
        (window as any).modalManager = this.modalManager;
        (window as any).openEditModal = (v: any) => this.modalManager.openEditModal(v);
        (window as any).openViewModal = (v: any) => this.modalManager.openViewModal(v);
        (window as any).openCloneModal = (v: any) => { if (v) this.modalManager.openCloneModal(v); };
        (window as any).openHistoryModal = (name?: string) => this.modalManager.openHistoryModal(name);
        (window as any).openOptimizeModal = (name: string) => this.modalManager.openOptimizeModal(name);
        (window as any).openImportReviewModal = (vars: any, options?: any) => this.modalManager.openImportReviewModal(vars, options);
        
        (window as any).openDeleteConfirm = (names: string[]) => {
            const count = names.length;
            if (count === 0) return;

            const message = count === 1 
                ? `Are you sure you want to delete "${names[0]}"?`
                : `Are you sure you want to delete ${count} items? (${names.slice(0, 3).join(', ')}${count > 3 ? '...' : ''})`;
            
            this.modalManager.openConfirmModal(
                message,
                async () => {
                    showToast(`Deleting ${count} items...`);
                    let successCount = 0;
                    for (const name of names) {
                        const v = getVarById(name);
                        const res = await window.electronAPI.deleteEnvVar(name, v?.isSystem || false);
                        if (res.success) successCount++;
                    }
                    showToast(`Deleted ${successCount} variables`);
                    await actionService.loadEnvVars(true);
                    state.selectedVars.clear();
                    state.selectedFolders.clear();
                    state.notify();
                }
            );
        };
        (window as any).showContextMenu = (e: MouseEvent, name: string, isFolder: boolean, isFolderAllProtected?: boolean) => 
            this.contextMenu.show(e, name, isFolder, isFolderAllProtected ?? false);
        (window as any).updateToolbarButtons = () => this.updateToolbarButtons();
        (window as any).handleCopyFeedback = (btn: HTMLButtonElement) => handleCopyFeedback(btn);

        this.setupGlobalListeners();
        this.initResizablePanels();
        this.init();
    }

    private async init() {
        debugLog('Init starting...');
        try {
            await this.loadOsInfo();
            debugLog('OS Info loaded');
            await actionService.loadEnvVars();
            debugLog('Env Vars loaded');
            // Load saved view preference
            const savedView = localStorage.getItem('env-vars-view');
            if (savedView === 'list' || savedView === 'folder') {
                state.currentView = savedView;
            }

            state.subscribe(() => this.render());
            this.render();
            debugLog('Initial render complete');
        } catch (e: any) {
            debugLog(`INIT ERROR: ${e.message}`);
        }
    }

    private async loadOsInfo() {
        try {
            const osInfo = await window.electronAPI.getOsInfo();
            $('os-name').textContent = osInfo.type || 'Desktop';
            $('os-platform').textContent = osInfo.platform;
            $('os-arch').textContent = osInfo.arch;
            $('os-hostname').textContent = osInfo.hostname;
            $('os-memory').textContent = osInfo.totalMem;
            $('os-cpus').textContent = osInfo.cpus.toString();
            $('os-uptime').textContent = osInfo.uptime;
            
            // Update icon based on platform
            const osIcon = $('os-icon');
            if (osInfo.platform === 'win32') {
                osIcon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M0 3.449L9.75 2.1V11.7H0V3.449zm0 17.1L9.75 21.9V12.3H0v8.249zM10.5 2V11.7H24V0L10.5 2zM10.5 22L24 24V12.3H10.5V22z"/></svg>`;
            } else if (osInfo.platform === 'darwin') {
                osIcon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.057 12.72c.032 2.64 2.308 3.53 2.342 3.54-.021.063-.365 1.254-1.221 2.503-.74 1.08-1.508 2.156-2.703 2.177-1.175.02-1.554-.701-2.894-.701-1.341 0-1.763.68-2.873.721-1.154.043-2.022-1.164-2.768-2.245-1.525-2.21-2.689-6.248-1.119-8.974.78-1.354 2.17-2.214 3.444-2.235 1.054-.021 2.048.707 2.693.707.645 0 1.839-.884 3.102-.756 1.059.043 2.01.424 2.651 1.002-4.008 1.547-3.344 6.255.341 7.26zM12.03 4.652c.569-.691.954-1.653.848-2.613-.825.033-1.823.551-2.415 1.241-.531.609-.997 1.593-.872 2.529.919.071 1.87-.466 2.439-1.157z"/></svg>`;
            } else {
                osIcon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2c-3.1 0-5.7 2.3-6 5.3-.4 3.7 2 6.7 5.5 6.7h1c3.5 0 5.9-3 5.5-6.7-.3-3-2.9-5.3-6-5.3zm-3 12c-2.8 0-5 2.2-5 5v1h16v-1c0-2.8-2.2-5-5-5h-6z"/></svg>`;
            }
        } catch (error) {
            console.error('Error loading OS info:', error);
        }
    }

    private setupGlobalListeners() {
        // View switches
        $('view-list').onclick = () => {
            state.currentView = 'list';
            localStorage.setItem('env-vars-view', 'list');
            state.notify();
        };
        $('view-folder').onclick = () => {
            state.currentView = 'folder';
            localStorage.setItem('env-vars-view', 'folder');
            state.notify();
        };

        // Actions
        $('btn-refresh').onclick = () => actionService.loadEnvVars();
        $('btn-add').onclick = () => this.modalManager.openEditModal();
        $('btn-auto-group').onclick = () => groupingService.handleAutoGroup();
        $('btn-ungroup').onclick = () => groupingService.ungroupSelected();
        $('btn-clone-bulk').onclick = () => {
            const vars = Array.from(state.selectedVars).map(n => getVarById(n)).filter(v => !!v) as any[];
            if (vars.length > 0) {
                this.modalManager.openImportReviewModal(vars, { title: 'Clone Selected Variables', mode: 'clone' });
            }
        };
        $('btn-delete-bulk').onclick = () => {
            const names = Array.from(state.selectedVars);
            if (names.length > 0) (window as any).openDeleteConfirm(names);
        };
        $('btn-group').onclick = () => this.modalManager.openGroupModal();

        // Keyboard Shortcuts
        window.addEventListener('keydown', (e) => {
            const isCtrl = e.ctrlKey || e.metaKey;
            
            // Key identification
            const key = e.key.toLowerCase();

            if (isCtrl && key === 'c') {
                clipboardService.copySelected();
            } else if (isCtrl && key === 'v') {
                clipboardService.paste();
            } else if (key === 'delete') {
                this.handleDeleteKey();
            } else if (isCtrl && key === 'a') {
                // Ignore if in input
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
                
                e.preventDefault();
                if (state.currentView === 'folder') {
                    this.explorer.selectAll();
                } else {
                    this.tableView.selectAll();
                }
            } else if (isCtrl && key === 'u') {
                e.preventDefault();
                state.selectedVars.clear();
                state.selectedFolders.clear();
                state.selectedExplorerVar = null;
                state.notify();
                this.explorer.updateDetailsPanel(); // Clear details pane 
                (window as any).updateToolbarButtons();
                this.render();
            }
        });

        // Search
        const searchInput = $('search-input') as HTMLInputElement;
        const btnClearSearch = $('btn-clear-search');
        
        searchInput.oninput = (e) => {
            state.searchQuery = (e.target as HTMLInputElement).value;
            btnClearSearch.style.display = state.searchQuery ? 'flex' : 'none';
            state.notify();
        };

        btnClearSearch.onclick = () => {
            searchInput.value = '';
            state.searchQuery = '';
            state.notify();
        };

        // Window controls
        $('btn-minimize').onclick = () => window.electronAPI.windowMinimize();
        $('btn-maximize').onclick = () => window.electronAPI.windowMaximize();
        $('btn-close').onclick = () => window.electronAPI.windowClose();

        $('btn-history').onclick = () => this.modalManager.openHistoryModal();
        $('btn-os-vars').onclick = () => this.modalManager.openOsVarsModal();
        $('btn-auto-protect').onclick = () => this.handleAutoProtect();
        $('btn-import').onclick = () => importService.openImportModal();

        window.onclick = () => {
             const m = $('folder-sort-menu');
             if (m) m.style.display = 'none';
        };

        // Toggle Groups (Collapse/Expand All)
        const btnToggleGroups = document.getElementById('btn-toggle-groups');
        if (btnToggleGroups) {
            btnToggleGroups.onclick = () => {
                if (state.currentView === 'list') {
                    const allCollapsed = Object.keys(state.groups).every(g => state.collapsedGroups.has(g));
                    if (allCollapsed) state.collapsedGroups.clear();
                    else Object.keys(state.groups).forEach(g => state.collapsedGroups.add(g));
                } else {
                    const allCollapsed = state.allEnvVars.every(v => {
                        const parts = splitVarName(v.name);
                        return parts.length <= 1 || state.collapsedFolders.has(parts.slice(0, parts.length - 1).join('/'));
                    });
                    if (allCollapsed) state.collapsedFolders.clear();
                    else {
                        state.allEnvVars.forEach(v => {
                            const parts = splitVarName(v.name);
                            for (let i = 1; i < parts.length; i++) {
                                state.collapsedFolders.add(parts.slice(0, i).join('/'));
                            }
                        });
                    }
                }
                state.notify();
            };
        }

        // Export Dropdown Component
        new ExportDropdown('export-dropdown-container', {
            id: 'export-main',
            onExport: (format: string, isMasked: boolean) => {
                const varsToExport = this.getVarsToExport();
                if (format === 'script') {
                    this.modalManager.openScriptExportModal(varsToExport, isMasked);
                } else {
                    window.electronAPI.exportEnvVars(varsToExport, format, isMasked);
                }
            }
        });

        // Sorting Headers
        const handleSort = (field: any) => {
            if (state.sortBy === field) {
                state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortBy = field;
                state.sortOrder = 'asc';
            }
            state.notify();
        };

        $('header-name').onclick = () => handleSort('name');
        $('header-value').onclick = () => handleSort('value');
        $('header-protected').onclick = () => handleSort('protected');
    }

    private getVarsToExport(): any[] {
        const selectedFromFolders = new Set<string>();
        if (state.selectedFolders.size > 0) {
            state.selectedFolders.forEach(folderPath => {
                const parts = folderPath.split('/');
                state.allEnvVars.forEach(v => {
                    const vParts = splitVarName(v.name);
                    // Check if vParts starts with parts
                    if (vParts.length >= parts.length) {
                        const match = parts.every((p, i) => vParts[i] === p);
                        if (match) selectedFromFolders.add(v.name);
                    }
                });
            });
        }

        const allSelectedNames = new Set([...state.selectedVars, ...selectedFromFolders]);

        if (allSelectedNames.size > 0) {
            // Apply current sorting preference to selected export
            const selectedVars = state.allEnvVars
                .filter(v => allSelectedNames.has(v.name))
                .sort((a, b) => {
                    let valA: any = '';
                    let valB: any = '';
                    if (state.sortBy === 'name') {
                        valA = a.name;
                        valB = b.name;
                    } else if (state.sortBy === 'value') {
                        valA = a.value || '';
                        valB = b.value || '';
                    } else if (state.sortBy === 'protected') {
                        valA = state.protectedVars.has(a.name) ? 1 : 0;
                        valB = state.protectedVars.has(b.name) ? 1 : 0;
                    }
                    if (valA < valB) return state.sortOrder === 'asc' ? -1 : 1;
                    if (valA > valB) return state.sortOrder === 'asc' ? 1 : -1;
                    return 0;
                });

            return selectedVars.map(v => ({
                ...v,
                isProtected: state.protectedVars.has(v.name),
                groupName: Object.entries(state.groups).find(([_, names]) => names.includes(v.name))?.[0]
            }));
        }
        
        return state.filteredVars;
    }

    private initResizablePanels() {
        // Sidebar Resizer
        const sidebarResizer = $('resizer-sidebar');
        
        sidebarResizer.onmousedown = (e) => {
            e.preventDefault();
            state.isDraggingSidebar = true;
            document.addEventListener('mousemove', this.handleSidebarResize);
            document.addEventListener('mouseup', () => {
                state.isDraggingSidebar = false;
                document.removeEventListener('mousemove', this.handleSidebarResize);
            });
        };

        // Details Resizer
        const detailsResizer = $('resizer-details');
        
        detailsResizer.onmousedown = (e) => {
            e.preventDefault();
            state.isDraggingDetails = true;
            document.addEventListener('mousemove', this.handleDetailsResize);
            document.addEventListener('mouseup', () => {
                state.isDraggingDetails = false;
                document.removeEventListener('mousemove', this.handleDetailsResize);
            });
        };

        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                const active = document.activeElement as HTMLElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
                
                e.preventDefault();
                this.selectAllAction();
            }
        });
    }

    private selectAllAction() {
        if (state.currentView === 'list') {
            this.tableView.selectAll(true);
        } else {
            this.explorer.selectAll();
        }
    }

    private handleSidebarResize = (e: MouseEvent) => {
        const explorerSidebar = $('explorer-sidebar');
        const minWidth = 100;
        const maxWidth = 400;
        let newWidth = e.clientX - explorerSidebar.getBoundingClientRect().left;
        
        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;
        
        explorerSidebar.style.width = `${newWidth}px`;
    };

    private handleDetailsResize = (e: MouseEvent) => {
        const explorerDetails = $('explorer-details');
        const minWidth = 150;
        const maxWidth = 500;
        
        let newWidth = explorerDetails.getBoundingClientRect().right - e.clientX;
        
        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;
        
        explorerDetails.style.width = `${newWidth}px`;
    };

    private async handleAutoProtect() {
        const { SENSITIVE_KEYWORDS } = await import('./utils.js');
        const { showToast, showLoading } = await import('./utils.js');
        
        showLoading(true, 'Identifying sensitive data...');
        const namesToProtect = state.allEnvVars
            .filter(v => {
                const upper = v.name.toUpperCase();
                return SENSITIVE_KEYWORDS.some(k => upper.includes(k)) && !state.protectedVars.has(v.name);
            })
            .map(v => v.name);

        if (namesToProtect.length > 0) {
            const result = await window.electronAPI.protectVars(namesToProtect, true);
            if (result.success) {
                showToast(`Protected ${namesToProtect.length} variables`);
                await actionService.loadEnvVars();
            }
        } else {
            showToast('No new sensitive variables found');
        }
        showLoading(false);
    }

    private render() {
        debugLog(`render() started. View: ${state.currentView}. Total: ${state.allEnvVars.length}`);
        
        state.filteredVars = this.filterAndSortVars();
        
        const total = state.allEnvVars.length;
        const count = state.filteredVars.length;
        
        const filteredCountEl = $('filtered-count');
        const totalVarsEl = $('total-vars');
        
        if (filteredCountEl) filteredCountEl.textContent = count.toString();
        if (totalVarsEl) totalVarsEl.textContent = total.toString();

        const tabList = $('view-list');
        const tabFolder = $('view-folder');
        const listContainer = $('table-view-container');
        const folderContainer = $('folder-view-container');

        if (state.currentView === 'list') {
            listContainer.style.display = 'block';
            folderContainer.style.display = 'none';
            
            tabList.classList.add('active');
            tabList.style.background = 'var(--accent-primary)';
            tabList.style.color = 'white';
            
            tabFolder.classList.remove('active');
            tabFolder.style.background = 'transparent';
            tabFolder.style.color = 'var(--text-secondary)';
            
            this.tableView.render();
        } else {
            listContainer.style.display = 'none';
            folderContainer.style.display = 'flex';
            
            tabFolder.classList.add('active');
            tabFolder.style.background = 'var(--accent-primary)';
            tabFolder.style.color = 'white';
            
            tabList.classList.remove('active');
            tabList.style.background = 'transparent';
            tabList.style.color = 'var(--text-secondary)';
            
            this.explorer.render();
        }

        this.updateToolbarButtons();

        // Admin Mode UI handling
        const btnAdmin = $('btn-admin-mode');
        const adminText = $('admin-mode-text');
        const adminContainer = $('admin-mode-container');
        
        if (state.isAdmin) {
            if (adminContainer) adminContainer.style.display = 'block';
            if (adminText) adminText.textContent = 'Admin Mode';
            if (btnAdmin) {
                btnAdmin.classList.remove('btn-secondary');
                btnAdmin.classList.add('btn-primary');
            }
        } else {
            // Hide User Mode button when in User Mode per request
            if (adminContainer) adminContainer.style.display = 'none';
        }

        debugLog('render() finished');
    }

    private filterAndSortVars(): any[] {
        const query = state.searchQuery.toLowerCase();
        const folderQuery = state.folderSearchQuery.toLowerCase();
        
        let filtered = state.allEnvVars.filter(v => {
            if (!v) return false;
            
            // Filter out system variables if not in Admin Mode (User Mode)
            if (!state.isAdmin && v.isSystem) return false;

            const name = (v.name || '').toLowerCase();
            const value = (v.value || '').toLowerCase();
            const matchesSearch = name.includes(query) || value.includes(query);
            const matchesFolderSearch = !folderQuery || name.includes(folderQuery) || value.includes(folderQuery);
            
            if (state.currentView === 'folder' && state.explorerPath.length > 0) {
                const prefix = state.explorerPath.join('_') + '_';
                return matchesSearch && matchesFolderSearch && name.startsWith(prefix.toLowerCase());
            }
            
            return matchesSearch && matchesFolderSearch;
        });

        // Apply Sorting
        filtered.sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            if (state.sortBy === 'name') {
                valA = a.name;
                valB = b.name;
            } else if (state.sortBy === 'value') {
                valA = a.value || '';
                valB = b.value || '';
            } else if (state.sortBy === 'protected') {
                valA = state.protectedVars.has(a.name) ? 1 : 0;
                valB = state.protectedVars.has(b.name) ? 1 : 0;
            }

            if (valA < valB) return state.sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return state.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered.map(v => ({
            ...v,
            isProtected: state.protectedVars.has(v.name),
            groupName: Object.entries(state.groups).find(([_, names]) => names.includes(v.name))?.[0]
        }));
    }

    private updateToolbarButtons() {
        const hasVarSelection = state.selectedVars.size > 0;
        const hasFolderSelection = state.selectedFolders.size > 0;
        const canGroup = state.selectedVars.size >= 2;
        
        const btnCloneBulk = $('btn-clone-bulk') as HTMLButtonElement;
        if (btnCloneBulk) {
            btnCloneBulk.style.display = hasVarSelection ? 'inline-flex' : 'none';
            btnCloneBulk.innerHTML = `👯 Clone Selected (${state.selectedVars.size})`;
        }

        const btnDeleteBulk = $('btn-delete-bulk') as HTMLButtonElement;
        if (btnDeleteBulk) {
            btnDeleteBulk.style.display = hasVarSelection ? 'inline-flex' : 'none';
            btnDeleteBulk.innerHTML = `🗑️ Delete Selected (${state.selectedVars.size})`;
        }

        const btnGroup = $('btn-group') as HTMLButtonElement;
        if (btnGroup) {
            btnGroup.style.display = hasVarSelection ? 'inline-flex' : 'none';
            btnGroup.disabled = !canGroup;
            btnGroup.innerHTML = `🔗 Group Selected (${state.selectedVars.size})`;
        }

        const btnUngroup = $('btn-ungroup') as HTMLButtonElement;
        if (btnUngroup) {
            const groupNames = Object.keys(state.groups);
            const hasSelectedFolderGroup = Array.from(state.selectedFolders).some(f => {
                const normalized = f.replace(/\//g, '__');
                const normalizedAlt = f.replace(/\//g, ':');
                return state.groups[normalized] || state.groups[`${normalized} Vars`] ||
                       state.groups[normalizedAlt] || state.groups[`${normalizedAlt} Vars`] ||
                       groupNames.some(g => g.startsWith(normalized) || g.startsWith(normalizedAlt));
            });

            const hasSelectedVarGroup = Array.from(state.selectedVars).some(v => {
                const isGrouped = groupNames.some(g => state.groups[g] && state.groups[g].includes(v));
                return isGrouped;
            });

            btnUngroup.style.display = (hasSelectedFolderGroup || hasSelectedVarGroup) ? 'inline-flex' : 'none';
        }

        const btnToggleGroups = $('btn-toggle-groups') as HTMLButtonElement;
        if (btnToggleGroups) {
            let allCollapsed = false;
            if (state.currentView === 'list') {
                const groupNames = Object.keys(state.groups);
                allCollapsed = groupNames.length > 0 && groupNames.every(g => state.collapsedGroups.has(g));
            } else {
                const allFoldersWithVars = new Set<string>();
                state.allEnvVars.forEach(v => {
                    const parts = splitVarName(v.name);
                    for(let i=1; i<parts.length; i++) {
                        allFoldersWithVars.add(parts.slice(0, i).join('/'));
                    }
                });
                allCollapsed = allFoldersWithVars.size > 0 && Array.from(allFoldersWithVars).every(f => state.collapsedFolders.has(f));
            }
            btnToggleGroups.innerHTML = allCollapsed ? '🔼 Expand All' : '🔽 Collapse All';
        }
    }

    private handleDeleteKey() {
        // If typing in a modal, don't delete
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
            return;
        }

        actionService.deleteSelected();
    }
}
