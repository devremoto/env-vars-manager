import { state } from '../state.js';
import { showToast, showLoading, getVarById, splitVarName } from '../utils.js';
import { actionService } from './ActionService.js';
import { EnvVar } from '../types.js';

export class ClipboardService {
    copySelected() {
        if (state.selectedVars.size === 0 && !state.selectedExplorerVar) {
            showToast('Nothing selected to copy', 'warning');
            return;
        }

        const itemsToCopy: EnvVar[] = [];
        
        // If we are in folder view and something is selected in explorer
        if (state.selectedExplorerVar) {
             const v = getVarById(state.selectedExplorerVar);
             if (v) {
                 itemsToCopy.push({ ...v, isProtected: state.protectedVars.has(v.name) });
             } else {
                 // It's a folder
                 const folderPath = [...state.explorerPath, state.selectedExplorerVar].join('_');
                 const varsInFolder = state.allEnvVars.filter(ev => ev.name.startsWith(folderPath + '_') || ev.name === folderPath);
                 if (varsInFolder.length > 0) {
                     state.clipboard = { type: 'folder', data: { name: state.selectedExplorerVar, vars: varsInFolder } };
                     showToast(`Copied folder "${state.selectedExplorerVar}" (${varsInFolder.length} items)`);
                     return;
                 }
             }
        }

        // Add all selected variables
        state.selectedVars.forEach(name => {
            const v = getVarById(name);
            if (v && !itemsToCopy.find(item => item.name === name)) {
                itemsToCopy.push({ ...v, isProtected: state.protectedVars.has(v.name) });
            }
        });

        if (itemsToCopy.length > 0) {
            state.clipboard = { type: 'vars', data: itemsToCopy };
            showToast(`Copied ${itemsToCopy.length} item(s)`);
        }
    }

    async paste() {
        if (!state.clipboard) {
            showToast('Nothing to paste', 'warning');
            return;
        }

        showLoading(true, 'Pasting items...');
        let successCount = 0;
        let failCount = 0;

        if (state.clipboard.type === 'vars') {
            const items = state.clipboard.data as EnvVar[];
            for (const item of items) {
                const newName = this.generateCopyName(item.name);
                const result = await window.electronAPI.createEnvVar(newName, item.value, item.isSystem, item.isProtected);
                if (result.success) successCount++;
                else failCount++;
            }
        } else if (state.clipboard.type === 'folder') {
            const { name, vars } = state.clipboard.data as { name: string, vars: EnvVar[] };
            for (const v of vars) {
                // For folders, we replace the folder name part with name_copy
                const parts = splitVarName(v.name);
                const folderIndex = parts.indexOf(name);
                if (folderIndex !== -1) {
                    parts[folderIndex] = `${name}_copy`;
                } else {
                    // fallback if structure is different
                    parts[0] = `${parts[0]}_copy`;
                }
                const newName = parts.join('_');
                const result = await window.electronAPI.createEnvVar(newName, v.value, v.isSystem, v.isProtected);
                if (result.success) successCount++;
                else failCount++;
            }
        }

        await actionService.loadEnvVars();
        showLoading(false);

        if (failCount === 0) {
            showToast(`Pasted ${successCount} item(s)`);
        } else {
            showToast(`Pasted ${successCount} item(s), ${failCount} failed`, 'warning');
        }
    }

    private generateCopyName(originalName: string): string {
        let newName = `${originalName}_copy`;
        let suffixCount = 1;
        while (getVarById(newName)) {
            newName = `${originalName}_copy${suffixCount++}`;
        }
        return newName;
    }

    // Special case for copying a whole folder in explorer view
    copyFolder(path: string, varsInFolder: EnvVar[]) {
        const varsWithProtection = varsInFolder.map(v => ({ ...v, isProtected: state.protectedVars.has(v.name) }));
        state.clipboard = { type: 'folder', data: { path, vars: varsWithProtection } };
        showToast(`Copied folder: ${path}`);
    }

    async pasteFolder(targetPath: string) {
        if (!state.clipboard || state.clipboard.type !== 'folder') return;
        
        const { vars } = state.clipboard.data;
        showLoading(true, `Pasting folder content...`);

        for (const item of vars) {
             // If pasting into a folder, we need to adjust the name if it's path-based
             // This app seems to use name-based paths like "FOLDER_SUBFOLDER_VAR"
             // Let's assume for now we just add _copy to the full name
             const newName = `${item.name}_copy`;
             await window.electronAPI.createEnvVar(newName, item.value, item.isSystem, item.isProtected);
        }

        await actionService.loadEnvVars();
        showLoading(false);
        showToast('Folder content pasted');
    }
}

export const clipboardService = new ClipboardService();
