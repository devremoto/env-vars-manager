import { state } from '../state.js';
import { $, $$, escapeHtml, getVarById, isPathLike, isUrlLike, truncate, SENSITIVE_KEYWORDS, MODAL_MASK, showToast, handleCopyFeedback, splitVarName } from '../utils.js';
import { EnvVar } from '../types.js';
import { actionService } from '../services/ActionService.js';
import { clipboardService } from '../services/ClipboardService.js';

export class Explorer {
    private explorerContent = $('explorer-content');
    private explorerSidebar = $('explorer-sidebar');
    private explorerBreadcrumbs = $('explorer-breadcrumbs');
    private explorerStatus = $('explorer-status');
    private detailsContent = $('details-content');
    private detailsEmpty = $$('.details-empty');
    private lastSelectedIndex: number = -1;
    private isSelecting = false;
    private selectionRect: HTMLDivElement | null = null;
    private startX = 0;
    private startY = 0;

    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        $('explorer-back').addEventListener('click', () => this.navigateBack());
        $('explorer-up').addEventListener('click', () => this.navigateUp());
        
        $('btn-details-copy').addEventListener('click', (e) => this.copyDetailsValue(e.target as HTMLButtonElement));
        $('btn-details-edit').addEventListener('click', () => this.editDetailsVar());
        $('btn-details-history').addEventListener('click', () => this.showHistory());
        $('btn-details-optimize').addEventListener('click', () => this.optimizeVar());
        $('btn-details-clone').addEventListener('click', () => this.cloneVar());
        $('btn-details-open-path').addEventListener('click', () => this.openPathInExplorer());
        
        const btnReveal = document.getElementById('btn-details-reveal');
        if (btnReveal) {
            btnReveal.addEventListener('click', () => {
                const name = $('details-name').textContent;
                if (name) {
                    if (state.revealedVars.has(name)) state.revealedVars.delete(name);
                    else state.revealedVars.add(name);
                    const v = getVarById(name);
                    if (v) this.updateDetailsPanel(v);
                }
            });
        }

        const btnProtect = document.getElementById('btn-details-protect');
        if (btnProtect) {
            btnProtect.addEventListener('click', () => {
                const name = $('details-name').textContent;
                if (name) actionService.toggleProtection(name);
            });
        }

        // Sort dropdown
        const sortBtn = $('btn-folder-sort');
        const sortMenu = $('folder-sort-menu');
        if (sortBtn && sortMenu) {
            sortBtn.onclick = (e) => {
                e.stopPropagation();
                const isHidden = sortMenu.style.display === 'none' || !sortMenu.style.display;
                sortMenu.style.display = isHidden ? 'block' : 'none';
                if (isHidden) this.updateSortMenuUI();
            };
            document.addEventListener('click', () => { 
                if (sortMenu.style.display === 'block') sortMenu.style.display = 'none'; 
            });
            sortMenu.onclick = (e) => e.stopPropagation();

            sortMenu.querySelectorAll('.sort-option').forEach(el => {
                el.addEventListener('click', (e) => {
                    const sortBy = (e.currentTarget as HTMLElement).dataset.sort as any;
                    if (state.sortBy === sortBy) {
                        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
                    } else {
                        state.sortBy = sortBy;
                        state.sortOrder = 'asc';
                    }
                    this.renderContent();
                });
            });

            const orderEl = $('folder-sort-order');
            if (orderEl) {
                orderEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
                    this.renderContent();
                });
            }
        }

        // Search/Filter logic
        const filterInput = $('explorer-filter') as HTMLInputElement;
        const btnClear = $('btn-clear-explorer');
        
        filterInput.addEventListener('input', () => {
            state.folderSearchQuery = filterInput.value.toLowerCase();
            btnClear.style.display = state.folderSearchQuery ? 'flex' : 'none';
            this.renderContent();
        });

        btnClear.addEventListener('click', () => {
            filterInput.value = '';
            state.folderSearchQuery = '';
            btnClear.style.display = 'none';
            this.renderContent();
            filterInput.focus();
        });

        // Marquee selection
        this.explorerContent.addEventListener('mousedown', (e) => this.handleMarqueeDown(e));
        document.addEventListener('mousemove', (e) => this.handleMarqueeMove(e));
        document.addEventListener('mouseup', () => this.handleMarqueeUp());

        // Context menu for empty area
        this.explorerContent.addEventListener('contextmenu', (e) => {
            if (!(e.target as HTMLElement).closest('.explorer-tile')) {
                const currentFolderPath = state.explorerPath.join('/');
                (window as any).contextMenu.show(e, currentFolderPath, false, false, true);
            }
        });
    }

    render() {
        this.renderSidebar();
        this.renderBreadcrumbs();
        this.renderContent();
        this.updateStatus();
    }

    private renderSidebar() {
        if (!this.explorerSidebar) return;
        const tree = this.buildFolderTree();
        this.explorerSidebar.innerHTML = '<div class="sidebar-header">Folders</div>';
        
        const rootList = document.createElement('ul');
        rootList.className = 'sidebar-tree';
        
        // Add "All Variables" root
        const allItem = document.createElement('li');
        allItem.className = `sidebar-item ${state.explorerPath.length === 0 ? 'selected' : ''}`;
        allItem.innerHTML = `
            <span class="item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </span>
            <span class="item-text">Root</span>`;
        allItem.style.paddingLeft = '12px';
        allItem.onclick = () => this.navigateTo([]);
        rootList.appendChild(allItem);

        this.renderTreeNodes(tree, rootList, []);
        this.explorerSidebar.appendChild(rootList);
    }

    private renderTreeNodes(nodes: any, parentElement: HTMLElement, currentPath: string[]) {
        const sortedKeys = Object.keys(nodes).sort();
        
        sortedKeys.forEach(name => {
            if (name === '__vars__' || name === '__all_protected__') return;
            
            const node = nodes[name];
            const itemPath = [...currentPath, name];
            const pathStr = itemPath.join('/');
            const isSelected = JSON.stringify(state.explorerPath) === JSON.stringify(itemPath);
            const isCollapsed = state.collapsedFolders.has(pathStr);
            const hasChildren = Object.keys(node).filter(k => k !== '__vars__' && k !== '__all_protected__').length > 0;
            
            const li = document.createElement('li');
            li.className = 'sidebar-node';
            
            const item = document.createElement('div');
            item.className = `sidebar-item ${isSelected ? 'selected' : ''}`;
            const indent = currentPath.length * 16 + 12;
            item.style.paddingLeft = `${indent}px`;
            
            item.innerHTML = `
                ${hasChildren ? `<span class="toggle-icon">${isCollapsed ? '▶' : '▼'}</span>` : '<span class="toggle-spacer"></span>'}
                <span class="item-icon">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="#FFC107"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                </span>
                <span class="item-text">${escapeHtml(name)}</span>
                ${node.__all_protected__ ? `<span class="item-badge" title="All Protected" style="margin-left: auto; display: flex; align-items: center; color: currentColor;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                </span>` : ''}
            `;
            
            // Toggle collapse on icon click
            if (hasChildren) {
                const toggle = item.querySelector('.toggle-icon');
                toggle?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (isCollapsed) state.collapsedFolders.delete(pathStr);
                    else state.collapsedFolders.add(pathStr);
                    this.renderSidebar();
                });
            }

            item.onclick = (e) => {
                e.stopPropagation();
                this.navigateTo(itemPath);
            };
            
            li.appendChild(item);
            
            if (hasChildren && !isCollapsed) {
                const subList = document.createElement('ul');
                subList.className = 'sidebar-sub-tree';
                this.renderTreeNodes(node, subList, itemPath);
                li.appendChild(subList);
            }
            
            parentElement.appendChild(li);
        });
    }

    private renderBreadcrumbs() {
        if (!this.explorerBreadcrumbs) return;
        this.explorerBreadcrumbs.innerHTML = '';
        
        const root = document.createElement('span');
        root.className = 'breadcrumb-item';
        root.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
        root.onclick = () => this.navigateTo([]);
        this.explorerBreadcrumbs.appendChild(root);

        state.explorerPath.forEach((name, index) => {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-sep';
            sep.textContent = '›';
            this.explorerBreadcrumbs.appendChild(sep);

            const item = document.createElement('span');
            item.className = 'breadcrumb-item';
            item.textContent = name;
            item.onclick = () => this.navigateTo(state.explorerPath.slice(0, index + 1));
            this.explorerBreadcrumbs.appendChild(item);
        });
    }

    private renderContent() {
        if (!this.explorerContent) return;
        this.explorerContent.innerHTML = '';
        
        const currentFolder = this.getCurrentFolderNode();
        const items: HTMLElement[] = [];
        
        // combine BOTH search queries so BOTH fields filter the current view
        const filter = (state.folderSearchQuery || state.searchQuery || '').toLowerCase();

        // Update Sort UI badges
        this.updateSortMenuUI();

        if (filter) {
            // RECURSIVE SEARCH: Find matches in current folder AND all subfolders
            const matches: { name: string, type: 'folder' | 'file', node: any, variable?: EnvVar }[] = [];
            
            const searchRecursive = (node: any, path: string[]) => {
                // Search folders
                Object.keys(node).forEach(key => {
                    if (key === '__vars__' || key === '__all_protected__') return;
                    if (key.toLowerCase().includes(filter)) {
                        matches.push({ name: key, type: 'folder', node: node[key] });
                    }
                    searchRecursive(node[key], [...path, key]);
                });
                // Search variables
                (node.__vars__ || []).forEach((v: EnvVar) => {
                    if (v.name.toLowerCase().includes(filter) || v.value.toLowerCase().includes(filter)) {
                        matches.push({ name: v.name, type: 'file', node: node, variable: v });
                    }
                });
            };
            
            searchRecursive(currentFolder, []);

            // Sort search results
            matches.sort((a, b) => {
                let comp = 0;
                if (state.sortBy === 'protected') {
                    const aP = a.variable ? (state.protectedVars.has(a.variable.name) ? 1 : 0) : (a.node.__all_protected__ ? 1 : 0);
                    const bP = b.variable ? (state.protectedVars.has(b.variable.name) ? 1 : 0) : (b.node.__all_protected__ ? 1 : 0);
                    comp = bP - aP; // Protected first
                } else if (state.sortBy === 'value') {
                    const ValA = a.variable ? a.variable.value : '';
                    const ValB = b.variable ? b.variable.value : '';
                    comp = ValA.localeCompare(ValB);
                } else {
                    const nameA = a.variable ? a.variable.name : a.name;
                    const nameB = b.variable ? b.variable.name : b.name;
                    comp = nameA.localeCompare(nameB);
                }
                
                if (comp === 0) {
                    const nameA = a.variable ? a.variable.name : a.name;
                    const nameB = b.variable ? b.variable.name : b.name;
                    comp = nameA.localeCompare(nameB);
                }
                
                return state.sortOrder === 'asc' ? comp : -comp;
            });

            matches.forEach(m => {
                items.push(this.createExplorerItem(m.name, m.type, m.node, m.variable));
            });
            
            if (items.length === 0) {
                this.explorerContent.innerHTML = `<div class="explorer-empty">No results found for "${escapeHtml(filter)}"</div>`;
                return;
            }
        } else {
            // NORMAL VIEW: Non-recursive, just current level
            const folderKeys = Object.keys(currentFolder).filter(k => k !== '__vars__' && k !== '__all_protected__');
            const sortedFolderKeys = folderKeys.sort((a, b) => {
                if (state.sortBy === 'protected') {
                    const aP = currentFolder[a]?.__all_protected__ ? 1 : 0;
                    const bP = currentFolder[b]?.__all_protected__ ? 1 : 0;
                    const comp = bP - aP; // Protected first
                    return state.sortOrder === 'asc' ? comp : -comp;
                }
                return state.sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
            });

            sortedFolderKeys.forEach(name => {
                items.push(this.createExplorerItem(name, 'folder', currentFolder));
            });

            const varsInFolder = (currentFolder.__vars__ || []) as EnvVar[];
            const sortedVars = [...varsInFolder].sort((a, b) => {
                let comp = 0;
                if (state.sortBy === 'protected') {
                    const aP = state.protectedVars.has(a.name) ? 1 : 0;
                    const bP = state.protectedVars.has(b.name) ? 1 : 0;
                    comp = bP - aP; // Protected first
                } else if (state.sortBy === 'value') {
                    comp = a.value.localeCompare(b.value);
                } else {
                    comp = a.name.localeCompare(b.name);
                }
                
                if (comp === 0) comp = a.name.localeCompare(b.name);
                return state.sortOrder === 'asc' ? comp : -comp;
            });

            sortedVars.forEach((v: EnvVar) => {
                items.push(this.createExplorerItem(v.name, 'file', currentFolder, v));
            });
        }

        items.forEach(item => this.explorerContent.appendChild(item));
        this.updateNavButtons();
        this.updateStatus();
    }

    private createExplorerItem(name: string, type: 'folder' | 'file', currentFolderNode: any, variable?: EnvVar) {
        const item = document.createElement('div');
        const fullPath = type === 'folder' ? [...state.explorerPath, name].join('/') : name;
        const isSelected = type === 'file' ? state.selectedVars.has(variable!.name) : state.selectedFolders.has(fullPath);
        item.className = `explorer-tile ${isSelected ? 'selected' : ''} ${type}`;
        item.title = fullPath; // Store full path for selection logic
        
        const isProtected = variable && state.protectedVars.has(variable.name);
        const folderNode = type === 'folder' ? currentFolderNode[name] : null;
        const isFolderProtected = type === 'folder' && folderNode?.__all_protected__ === true;
        
        // Show only the last part of variable name in Folder View
        const displayName = type === 'file' ? (splitVarName(name).pop() || name) : name;
        
        const iconSvg = type === 'folder' 
            ? `<svg viewBox="0 0 24 24" width="48" height="48" fill="#FFC107"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`
            : `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;

        item.innerHTML = `
            <div class="explorer-tile-icon">
                <div class="explorer-tile-icon-container">
                    ${iconSvg}
                    ${(isProtected || isFolderProtected) ? `
                    <div class="explorer-tile-badge" title="${isFolderProtected ? 'All contents protected' : 'Protected'}">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
                        </svg>
                    </div>` : ''}
                </div>
            </div>
            <div class="explorer-tile-label" title="${escapeHtml(name)}">${escapeHtml(displayName)}</div>
        `;

        item.onclick = (e) => {
            e.stopPropagation();
            this.selectItem(fullPath, type, variable, e);
        };

        item.ondblclick = (e) => {
            e.stopPropagation();
            if (type === 'folder') {
                this.navigateTo([...state.explorerPath, name]);
            } else if (variable) {
                (window as any).openEditModal(variable);
            }
        };

        item.oncontextmenu = (e) => {
            (window as any).showContextMenu(e, type === 'file' ? variable?.name : name, type === 'folder', isFolderProtected);
        };

        return item;
    }

    private selectItem(name: string, type: 'folder' | 'file', variable?: EnvVar, event?: MouseEvent) {
        if (type === 'file' && variable) {
            const isCtrl = event?.ctrlKey || event?.metaKey;
            const isShift = event?.shiftKey;
            
            const allItems = Array.from(this.explorerContent.querySelectorAll('.explorer-tile.file'));
            const currentIndex = allItems.findIndex(el => (el as HTMLElement).title === name);

            if (isShift && this.lastSelectedIndex !== -1) {
                // Range selection
                const start = Math.min(this.lastSelectedIndex, currentIndex);
                const end = Math.max(this.lastSelectedIndex, currentIndex);
                
                if (!isCtrl) state.selectedVars.clear();
                for (let i = start; i <= end; i++) {
                    const itemName = (allItems[i] as HTMLElement).title;
                    if (itemName) state.selectedVars.add(itemName);
                }
            } else if (isCtrl) {
                // Toggle selection
                if (state.selectedVars.has(variable.name)) {
                    state.selectedVars.delete(variable.name);
                } else {
                    state.selectedVars.add(variable.name);
                }
                this.lastSelectedIndex = currentIndex;
            } else {
                // Single selection
                state.selectedVars.clear();
                state.selectedVars.add(variable.name);
                this.lastSelectedIndex = currentIndex;
            }
            
            state.selectedExplorerVar = variable.name;
        } else {
            // Folder selection with multiple support
            const isCtrl = event?.ctrlKey || event?.metaKey;
            const isShift = event?.shiftKey;
            
            const allItems = Array.from(this.explorerContent.querySelectorAll('.explorer-tile.folder'));
            const currentIndex = allItems.findIndex(el => (el as HTMLElement).title === name);
            const isAlreadySelected = state.selectedFolders.has(name);

            if (isShift && this.lastSelectedIndex !== -1) {
                const start = Math.min(this.lastSelectedIndex, currentIndex);
                const end = Math.max(this.lastSelectedIndex, currentIndex);
                if (!isCtrl) {
                    state.selectedFolders.clear();
                    state.selectedVars.clear();
                }
                for (let i = start; i <= end; i++) {
                    const fName = (allItems[i] as HTMLElement).title;
                    if (fName) {
                        state.selectedFolders.add(fName);
                        this.selectAllInFolder(fName, true);
                    }
                }
            } else if (isCtrl) {
                if (isAlreadySelected) {
                    state.selectedFolders.delete(name);
                    this.selectAllInFolder(name, false);
                } else {
                    state.selectedFolders.add(name);
                    this.selectAllInFolder(name, true);
                }
                this.lastSelectedIndex = currentIndex;
            } else {
                if (isAlreadySelected) {
                    state.selectedFolders.delete(name);
                    this.selectAllInFolder(name, false);
                } else {
                    state.selectedFolders.clear();
                    state.selectedVars.clear();
                    state.selectedFolders.add(name);
                    this.selectAllInFolder(name, true);
                }
                this.lastSelectedIndex = currentIndex;
            }
            
            state.selectedExplorerVar = name;
        }

        state.notify();
        (window as any).updateToolbarButtons(); // Refresh toolbar state
        this.renderContent();
        this.updateDetailsPanel(state.selectedVars.size > 1 ? undefined : variable);
    }

    private handleMarqueeDown(e: MouseEvent) {
        if (e.button !== 0 || (e.target as HTMLElement).closest('.explorer-tile')) return;
        
        this.isSelecting = true;
        this.startX = e.clientX;
        this.startY = e.clientY;

        if (!e.ctrlKey) {
            state.selectedVars.clear();
            state.selectedFolders.clear();
        }

        this.selectionRect = document.createElement('div');
        this.selectionRect.style.cssText = 'position: fixed; border: 1px solid var(--accent-primary); background: rgba(124, 106, 255, 0.15); pointer-events: none; z-index: 9999;';
        document.body.appendChild(this.selectionRect);
    }

    private handleMarqueeMove(e: MouseEvent) {
        if (!this.isSelecting || !this.selectionRect) return;

        const currentX = e.clientX;
        const currentY = e.clientY;
        
        const left = Math.min(this.startX, currentX);
        const top = Math.min(this.startY, currentY);
        const width = Math.abs(this.startX - currentX);
        const height = Math.abs(this.startY - currentY);

        this.selectionRect.style.left = `${left}px`;
        this.selectionRect.style.top = `${top}px`;
        this.selectionRect.style.width = `${width}px`;
        this.selectionRect.style.height = `${height}px`;

        // Check intersections
        const rect = this.selectionRect.getBoundingClientRect();
        const tiles = this.explorerContent.querySelectorAll('.explorer-tile');
        
        tiles.forEach(tile => {
            const tileRect = tile.getBoundingClientRect();
            const intersects = !(rect.right < tileRect.left || rect.left > tileRect.right || rect.bottom < tileRect.top || rect.top > tileRect.bottom);
            const name = (tile as HTMLElement).title;
            const isFolder = tile.classList.contains('folder');
            
            if (intersects) {
                if (isFolder) {
                    state.selectedFolders.add(name);
                    this.selectAllInFolder(name, true);
                } else {
                    state.selectedVars.add(name);
                }
                tile.classList.add('selected');
            } else if (!e.ctrlKey) {
                if (isFolder) {
                    state.selectedFolders.delete(name);
                    this.selectAllInFolder(name, false);
                } else {
                    state.selectedVars.delete(name);
                }
                tile.classList.remove('selected');
            }
        });

        (window as any).updateToolbarButtons();
    }

    private handleMarqueeUp() {
        if (!this.isSelecting) return;
        this.isSelecting = false;
        if (this.selectionRect) {
            this.selectionRect.remove();
            this.selectionRect = null;
        }
        this.renderContent();
        this.updateDetailsPanel(state.selectedVars.size > 1 ? undefined : (state.selectedVars.size === 1 ? getVarById([...state.selectedVars][0]) : undefined));
    }

    private navigateTo(path: string[]) {
        if (JSON.stringify(state.explorerPath) !== JSON.stringify(path)) {
            state.explorerHistory.push([...state.explorerPath]);
            state.explorerPath = path;
            state.selectedExplorerVar = null;
            this.render();
            this.updateDetailsPanel();
        }
    }

    private navigateBack() {
        if (state.explorerHistory.length > 0) {
            state.explorerPath = state.explorerHistory.pop()!;
            state.selectedExplorerVar = null;
            this.render();
            this.updateDetailsPanel();
        }
    }

    private navigateUp() {
        if (state.explorerPath.length > 0) {
            this.navigateTo(state.explorerPath.slice(0, -1));
        }
    }

    private buildFolderTree() {
        const tree: any = {};
        state.allEnvVars.forEach(v => {
            // Filter out system variables if not in Admin Mode (User Mode)
            if (!state.isAdmin && v.isSystem) return;

            const parts = splitVarName(v.name);
            let current = tree;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!current[part]) current[part] = {};
                current = current[part];
            }
            if (!current.__vars__) current.__vars__ = [];
            current.__vars__.push(v);
        });

        // Calculate recursive protection status
        // IMPORTANT: always recurse into ALL children first, regardless of the current
        // node's own vars — otherwise sibling folders never get their flag set.
        const checkProtection = (node: any): boolean => {
            const vars: EnvVar[] = node.__vars__ || [];
            const subfolders = Object.keys(node).filter(k => k !== '__vars__' && k !== '__all_protected__');

            // Always recurse into every subfolder so they each get __all_protected__ computed
            let allChildrenProtected = true;
            for (const folder of subfolders) {
                if (!checkProtection(node[folder])) {
                    allChildrenProtected = false;
                }
            }

            // Check own direct vars
            const anyUnprotectedVar = vars.some((v: EnvVar) => !state.protectedVars.has(v.name));
            const hasContent = vars.length > 0 || subfolders.length > 0;

            // All protected only if: has content, no unprotected own vars, and all subfolders are protected
            node.__all_protected__ = hasContent && !anyUnprotectedVar && allChildrenProtected;
            return node.__all_protected__;
        };

        checkProtection(tree);
        return tree;
    }

    private getCurrentFolderNode() {
        const tree = this.buildFolderTree();
        let current = tree;
        for (const part of state.explorerPath) {
            if (current[part]) current = current[part];
            else return { __vars__: [] }; // Path not found
        }
        return current;
    }

    public updateDetailsPanel(variable?: EnvVar) {
        // Handle Multiple Selection
        if (state.selectedVars.size > 1) {
            this.detailsContent.style.display = 'block';
            this.detailsEmpty.style.display = 'none';

            // Special UI for multiple selection
            $('details-name').textContent = `${state.selectedVars.size} items selected`;
            $('badge-type').textContent = 'Group Selection';
            $('details-value').innerHTML = `<div style="padding:10px; color:var(--text-muted); font-size:12px; font-style:italic;">
                You have selected multiple variables. Use the toolbar at the top to group, protect, or delete them.
            </div>`;
            
            $('badge-protected').style.display = 'none';
            $('btn-details-reveal').style.display = 'none';
            $('btn-details-open-path').style.display = 'none';
            $('btn-details-optimize').style.display = 'none';
            $('btn-details-edit').style.display = 'none';
            $('btn-details-history').style.display = 'none';
            $('btn-details-clone').style.display = 'none';
            $('btn-details-copy').style.display = 'none';
            return;
        }

        if (!variable) {
            this.detailsContent.style.display = 'none';
            this.detailsEmpty.style.display = 'block';
            return;
        }

        this.detailsContent.style.display = 'block';
        this.detailsEmpty.style.display = 'none';
        
        // Show all single-item buttons
        $('btn-details-edit').style.display = 'block';
        $('btn-details-history').style.display = 'block';
        $('btn-details-clone').style.display = 'block';
        $('btn-details-copy').style.display = 'block';

        $('details-name').textContent = variable.name;
        $('badge-type').textContent = variable.isSystem ? 'System' : 'User';
        
        const isProtected = state.protectedVars.has(variable.name);
        const isRevealed = state.revealedVars.has(variable.name);
        $('badge-protected').style.display = isProtected ? 'inline-block' : 'none';
        $('btn-details-reveal').style.display = isProtected ? 'flex' : 'none';
        
        const btnProtect = $('btn-details-protect');
        if (btnProtect) {
            btnProtect.innerHTML = isProtected ? '🔓 Unprotect' : '🛡️ Protect';
        }

        const valueEl = $('details-value');
        if (isProtected && !isRevealed) {
            valueEl.textContent = MODAL_MASK;
        } else {
            if (variable.value.includes(';') && isPathLike(variable.value)) {
                // Show mult-value format line-by-line
                const lines = variable.value.split(';').map(p => p.trim()).filter(p => !!p);
                valueEl.innerHTML = lines.map(p => `<div style="padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.05);">${escapeHtml(p)}</div>`).join('');
            } else {
                valueEl.textContent = variable.value;
            }
        }

        // Show/hide Open Path button
        const isUrl = isUrlLike(variable.value);
        const isPath = isPathLike(variable.value);
        const isOpenPathVisible = isPath || isUrl;
        const btnOpen = $('btn-details-open-path');
        
        // Per request: do not need to show manage paths in details view
        const isMultiPath = isPath && variable.value.includes(';');
        btnOpen.style.display = (isOpenPathVisible && !isMultiPath) ? 'block' : 'none';
        
        if (isOpenPathVisible) {
            if (isPath && variable.value.includes(';')) {
                btnOpen.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Manage Paths';
                btnOpen.title = "View and manage multiple paths individually";
            } else {
                btnOpen.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> ${isUrl ? 'Open URL' : 'Open Path'}`;
                btnOpen.title = isUrl ? "Open URL in your default browser" : "Open path in Explorer";
            }
        }
        
        // Show/hide Optimize button
        $('btn-details-optimize').style.display = variable.canOptimize ? 'block' : 'none';
    }

    private updateNavButtons() {
        ($('explorer-back') as HTMLButtonElement).disabled = state.explorerHistory.length === 0;
        ($('explorer-up') as HTMLButtonElement).disabled = state.explorerPath.length === 0;
    }

    private updateStatus() {
        const node = this.getCurrentFolderNode();
        const folderCount = Object.keys(node).filter(k => k !== '__vars__' && k !== '__all_protected__').length;
        const varCount = (node.__vars__ || []).length;
        this.explorerStatus.textContent = `${folderCount} folders, ${varCount} variables`;
    }

    // Details actions
    private copyDetailsValue(btn: HTMLButtonElement) {
        const name = $('details-name').textContent;
        const v = getVarById(name!);
        if (v) {
            navigator.clipboard.writeText(v.value);
            showToast('Value copied to clipboard');
            handleCopyFeedback(btn);
        }
    }

    private editDetailsVar() {
        const name = $('details-name').textContent;
        const v = getVarById(name!);
        if (v) (window as any).openEditModal(v);
    }

    private showHistory() {
        const name = $('details-name').textContent;
        if (name) (window as any).openHistoryModal(name);
    }

    private optimizeVar() {
        const name = $('details-name').textContent;
        if (name) (window as any).openOptimizeModal(name);
    }

    private cloneVar() {
        const name = $('details-name').textContent;
        const v = getVarById(name!);
        if (v) (window as any).openCloneModal(v);
    }

    private openPathInExplorer() {
        const name = $('details-name').textContent;
        const v = getVarById(name!);
        if (v) {
            const raw = v.value;
            if (raw.includes(';') && isPathLike(raw)) {
                (window as any).openViewModal(v);
            } else {
                const isUrl = isUrlLike(raw);
                if (isUrl) {
                    window.electronAPI.openPath(raw);
                } else {
                    const isFile = raw.includes('.') || raw.endsWith('.txt') || (raw.includes('\\') && raw.split('\\').pop()!.includes('.'));
                    if (isFile) window.electronAPI.showItemInFolder(raw);
                    else window.electronAPI.openPath(raw);
                }
            }
        }
    }

    private updateSortMenuUI() {
        const menu = $('folder-sort-menu');
        if (!menu) return;

        // Active Sort Property
        menu.querySelectorAll('.sort-option').forEach(el => {
            const opt = (el as HTMLElement).dataset.sort;
            if (opt === state.sortBy) {
                el.classList.add('active-sort');
            } else {
                el.classList.remove('active-sort');
            }
        });

        // Order Label - Target the span to preserve the icon
        const orderText = $('sort-order-text');
        if (orderText) {
            orderText.textContent = `Sort: ${state.sortOrder === 'asc' ? 'Ascending' : 'Descending'}`;
        }
    }

    public selectAll() {
        const node = this.getCurrentFolderNode();
        
        // Select all folders in current view
        const folderKeys = Object.keys(node).filter(k => k !== '__vars__' && k !== '__all_protected__');
        folderKeys.forEach(name => {
            const fullPath = [...state.explorerPath, name].join('/');
            state.selectedFolders.add(fullPath);
            this.selectAllInFolder(fullPath, true);
        });

        // Select all variables in current view
        const varsInFolder = (node.__vars__ || []) as EnvVar[];
        varsInFolder.forEach(v => state.selectedVars.add(v.name));
        
        if (varsInFolder.length > 0) {
            state.selectedExplorerVar = varsInFolder[varsInFolder.length - 1].name;
        } else if (folderKeys.length > 0) {
            state.selectedExplorerVar = [...state.explorerPath, folderKeys[folderKeys.length - 1]].join('/');
        }

        (window as any).updateToolbarButtons();
        this.renderContent();
        
        const lastVar = varsInFolder.length > 0 ? varsInFolder[varsInFolder.length - 1] : undefined;
        this.updateDetailsPanel(state.selectedVars.size > 1 ? undefined : lastVar);
    }

    private selectAllInFolder(folderPath: string, select: boolean = true) {
        if (!folderPath) return;
        const tree = this.buildFolderTree();
        const parts = folderPath.split('/').filter(p => !!p);
        let current = tree;
        for (const p of parts) {
            if (current[p]) current = current[p];
            else return;
        }

        const processRecursive = (node: any) => {
            if (node.__vars__) {
                node.__vars__.forEach((v: EnvVar) => {
                    if (select) state.selectedVars.add(v.name);
                    else state.selectedVars.delete(v.name);
                });
            }
            Object.keys(node).forEach(key => {
                if (key !== '__vars__' && key !== '__all_protected__') {
                    processRecursive(node[key]);
                }
            });
        };
        processRecursive(current);
    }
}
