import { state } from '../state.js';
import { $, getVarById, splitVarName } from '../utils.js';
import { actionService } from '../services/ActionService.js';
import { clipboardService } from '../services/ClipboardService.js';

export class ContextMenu {
    private menu = $('context-menu');
    private isFolder = false;
    private targetName = '';


    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        document.addEventListener('click', () => this.hide());
        window.addEventListener('blur', () => this.hide());
        
        $('menu-view').onclick = (e) => { e.stopPropagation(); this.handleAction('view'); };
        $('menu-edit').onclick = (e) => { e.stopPropagation(); this.handleAction('edit'); };
        $('menu-copy').onclick = (e) => { e.stopPropagation(); this.handleAction('copy'); };
        $('menu-clone').onclick = (e) => { e.stopPropagation(); this.handleAction('clone'); };
        $('menu-copy-to-group').onclick = (e) => { e.stopPropagation(); this.handleAction('copy-group'); };
        $('menu-move-to-group').onclick = (e) => { e.stopPropagation(); this.handleAction('move-group'); };
        $('menu-delete').onclick = (e) => { e.stopPropagation(); this.handleAction('delete'); };
        $('menu-protect').onclick = (e) => { e.stopPropagation(); this.handleAction('protect'); };
        $('menu-history').onclick = (e) => { e.stopPropagation(); this.handleAction('history'); };
        $('menu-optimize').onclick = (e) => { e.stopPropagation(); this.handleAction('optimize'); };
        $('menu-open-path').onclick = (e) => { e.stopPropagation(); this.handleAction('open-path'); };

        // Folder Specific
        $('menu-folder-open').onclick = (e) => { e.stopPropagation(); this.handleAction('folder-open'); };
        $('menu-folder-add').onclick = (e) => { e.stopPropagation(); this.handleAction('folder-add'); };
        $('menu-folder-protect').onclick = (e) => { e.stopPropagation(); this.handleAction('folder-protect'); };
        $('menu-folder-rename').onclick = (e) => { e.stopPropagation(); this.handleAction('folder-rename'); };
        $('menu-folder-autoprotect').onclick = (e) => { e.stopPropagation(); this.handleAction('folder-autoprotect'); };
        $('menu-folder-ungroup').onclick = (e) => { e.stopPropagation(); this.handleAction('folder-ungroup'); };

        // General Area Specific
        $('menu-general-add').onclick = (e) => { e.stopPropagation(); this.handleAction('general-add'); };
    }

    show(e: MouseEvent, targetName: string, isFolder: boolean = false, isFolderAllProtected: boolean = false, isGeneral: boolean = false) {
        e.preventDefault();
        this.targetName = targetName;
        this.isFolder = isFolder;
        state.selectedExplorerVar = targetName;
        
        // Toggle menu items based on type
        const varActions = document.querySelectorAll('.context-menu .var-action');
        const folderActions = document.querySelectorAll('.context-menu .folder-action');
        const generalActions = document.querySelectorAll('.context-menu .general-action');
        
        varActions.forEach(el => (el as HTMLElement).style.display = (isFolder || isGeneral) ? 'none' : 'flex');
        folderActions.forEach(el => (el as HTMLElement).style.display = isFolder ? 'flex' : 'none');
        generalActions.forEach(el => (el as HTMLElement).style.display = isGeneral ? 'flex' : 'none');

        // Hide delete and separator for general context
        const deleteItem = $('menu-delete');
        const separator = document.querySelector('.context-menu .menu-sep') as HTMLElement;
        if (deleteItem) deleteItem.style.display = isGeneral ? 'none' : 'flex';
        if (separator) separator.style.display = isGeneral ? 'none' : 'flex';

        if (!isFolder) {
            const v = getVarById(targetName);
            const isProtected = v ? state.protectedVars.has(v.name) : false;
            $('menu-protect-text').textContent = isProtected ? 'Unprotect' : 'Protect';
            
            // Context aware labels for selection
            const cloneText = $('menu-clone');
            if (cloneText) {
                cloneText.textContent = state.selectedVars.size > 1 ? `👯 Clone Selected (${state.selectedVars.size})` : '👯 Clone Variable';
            }
        } else {
            // Dynamically label protect action based on current protection state
            const protectTextEl = document.getElementById('menu-folder-protect-text');
            if (protectTextEl) {
                protectTextEl.textContent = isFolderAllProtected ? 'Unprotect All Inside' : 'Protect All Inside';
            }
            // Store state for action handler
            (this as any)._folderAllProtected = isFolderAllProtected;
            
            // Check if folder is a group
            const ungroupBtn = $('menu-folder-ungroup');
            if (ungroupBtn) {
                const norm = targetName.replace(/\//g, '__');
                const normAlt = targetName.replace(/\//g, ':');
                const isGroup = !!state.groups[norm] || !!state.groups[`${norm} Vars`] || 
                                !!state.groups[normAlt] || !!state.groups[`${normAlt} Vars`] ||
                                Object.keys(state.groups).some(g => g.startsWith(norm) || g.startsWith(normAlt));
                ungroupBtn.style.display = isGroup ? 'flex' : 'none';
            }
        }

        this.menu.style.display = 'block';
        
        // Position menu
        const menuWidth = this.menu.offsetWidth || 180;
        const menuHeight = this.menu.offsetHeight || 380;
        
        let x = e.pageX;
        let y = e.pageY;
        
        if (x + menuWidth > window.innerWidth) x -= menuWidth;
        if (y + menuHeight > window.innerHeight) y -= menuHeight;
        
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
    }

    hide() {
        this.menu.style.display = 'none';
    }

    private handleAction(action: string) {
        const name = state.selectedExplorerVar;
        console.log(`ContextMenu: handleAction(${action}) for ${name}`);
        if (!name) return;

        this.hide();
        
        const getVarsToProcess = () => {
            if (this.isFolder) {
                // If we right-clicked a folder, we want to process all variables under it
                const fullPath = [...state.explorerPath, name];
                return state.allEnvVars.filter(v => {
                    const parts = splitVarName(v.name);
                    return fullPath.every((p, i) => parts[i] === p);
                });
            }

            const selected = Array.from(state.selectedVars).map(n => getVarById(n)).filter(v => !!v) as any[];
            if (selected.length > 0 && Array.from(state.selectedVars).includes(name)) return selected;
            const single = getVarById(name);
            return single ? [single] : [];
        };

        switch (action) {
            case 'view':
                (window as any).openViewModal(getVarById(name));
                break;
            case 'edit':
                (window as any).openEditModal(getVarById(name));
                break;
            case 'copy':
                const v = getVarById(name);
                if (v) navigator.clipboard.writeText(v.value);
                break;
            case 'clone':
            case 'copy-group':
            case 'move-group':
                const vars = getVarsToProcess();
                if (vars.length > 0) {
                    const title = action === 'clone' ? 'Clone Variables' : (action === 'move-group' ? 'Move to Group' : 'Copy to Group');
                    const mode = action === 'clone' ? 'clone' : (action === 'move-group' ? 'move' : 'copy-group');
                    (window as any).modalManager.openImportReviewModal(vars, { title, mode });
                }
                break;
            case 'delete':
                const toDel = getVarsToProcess().map(v => v.name);
                if (toDel.length > 0) (window as any).openDeleteConfirm(toDel);
                break;
            case 'protect':
                actionService.toggleProtection(name);
                break;
            case 'history':
                (window as any).openHistoryModal(name);
                break;
            case 'optimize':
                (window as any).openOptimizeModal(name);
                break;
            case 'open-path':
                const vPath = getVarById(name);
                if (vPath) window.electronAPI.openPath(vPath.value);
                break;
            case 'folder-open':
                (window as any).explorer.navigateTo([...state.explorerPath, name]);
                break;
            case 'folder-add':
                (window as any).openEditModal({ name: [...state.explorerPath, name, ''].join('_'), value: '' });
                break;
            case 'folder-protect':
                this.handleFolderProtect(name, !(this as any)._folderAllProtected);
                break;
            case 'folder-autoprotect':
                this.handleFolderAutoProtect(name);
                break;
            case 'folder-rename':
                this.handleFolderRename(name);
                break;
            case 'folder-ungroup':
                import('../services/GroupingService.js').then(m => m.groupingService.ungroup(name));
                break;
            case 'general-add':
                (window as any).openEditModal({ name: state.explorerPath.length > 0 ? `${state.explorerPath.join('_')}_` : '', value: '' });
                break;
        }
    }

    private async handleFolderProtect(folderName: string, protect: boolean) {
        const fullPath = [...state.explorerPath, folderName];
        // Identify all variables under this folder
        const varsToToggle = state.allEnvVars.filter(v => {
            const parts = splitVarName(v.name);
            return fullPath.every((p, i) => parts[i] === p);
        }).map(v => v.name);

        if (varsToToggle.length > 0) {
            await window.electronAPI.protectVars(varsToToggle, protect);
            await actionService.loadEnvVars();
        }
    }

    private async handleFolderAutoProtect(folderName: string) {
        const fullPath = [...state.explorerPath, folderName];
        const { SENSITIVE_KEYWORDS } = await import('../utils.js');
        
        const varsToProtect = state.allEnvVars.filter(v => {
            const parts = splitVarName(v.name);
            const isInside = fullPath.every((p, i) => parts[i] === p);
            if (!isInside) return false;
            
            const upper = v.name.toUpperCase();
            return SENSITIVE_KEYWORDS.some(k => upper.includes(k)) && !state.protectedVars.has(v.name);
        }).map(v => v.name);

        if (varsToProtect.length > 0) {
            await window.electronAPI.protectVars(varsToProtect, true);
            await actionService.loadEnvVars();
        }
    }

    private async handleFolderRename(folderName: string) {
        const fullPath = [...state.explorerPath, folderName];
        const oldPrefix = fullPath.join('__'); // This is what we strip
        
        const varsToRename = state.allEnvVars.filter(v => {
            const parts = splitVarName(v.name);
            return fullPath.every((p, i) => parts[i] === p);
        });

        if (varsToRename.length > 0) {
            (window as any).modalManager.openImportReviewModal(varsToRename, { 
                title: `Rename Group "${folderName}"`, 
                mode: 'move', // Rename is effectively a Move with prefix awareness
                defaultPrefix: folderName,
                stripPrefix: oldPrefix
            });
        }
    }
}
