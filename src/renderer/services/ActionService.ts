import { state } from '../state.js';
import { showToast, showLoading, getVarById, debugLog, splitVarName } from '../utils.js';
import { EnvVar } from '../types.js';

export class ActionService {
    private isFirstLoad = true;
    private modalManager: any = null;

    constructor() {}

    public setModalManager(mm: any) {
        this.modalManager = mm;
    }
    async loadEnvVars(quiet = false) {
        if (!quiet) showLoading(true);
        try {
            const vars = await window.electronAPI.getEnvVars();
            state.allEnvVars = vars;
            
            const protectedList = await window.electronAPI.getProtectedVars();
            state.protectedVars = new Set(protectedList);
            
            state.groups = await window.electronAPI.getGroups();
            
            // Initial collapse: only on first app startup
            if (this.isFirstLoad) {
                Object.keys(state.groups).forEach(g => state.collapsedGroups.add(g));
                this.isFirstLoad = false;
            }
            state.allEnvVars.forEach(v => {
                const parts = splitVarName(v.name);
                for (let i = 1; i < parts.length; i++) {
                    const path = parts.slice(0, i).join('/');
                    state.collapsedFolders.add(path);
                }
            });

            state.isAdmin = await window.electronAPI.checkIsAdmin();
            state.notify();
        } catch (error: any) {
            debugLog(`LOAD ERROR: ${error.message}`);
            console.error('Error loading variables:', error);
            showToast('Failed to load variables', 'error');
        } finally {
            showLoading(false);
        }
    }

    async saveVariable(name: string, value: string, isSystem: boolean = false) {
        showLoading(true, state.editingVar ? 'Updating variable...' : 'Creating variable...');
        try {
            let result;
            if (state.editingVar) {
                result = await window.electronAPI.updateEnvVar(name, value, state.editingVar.name, isSystem);
            } else {
                result = await window.electronAPI.createEnvVar(name, value, isSystem);
            }

            if (result.success) {
                showToast(state.editingVar ? 'Variable updated' : 'Variable created');
                await this.loadEnvVars(true);
                return true;
            } else {
                showToast(result.error || 'Failed to save variable', 'error');
                return false;
            }
        } catch (error) {
            showToast('An error occurred', 'error');
            return false;
        } finally {
            showLoading(false);
        }
    }

    async deleteVariable(name: string, isSystem: boolean = false) {
        try {
            const result = await window.electronAPI.deleteEnvVar(name, isSystem);
            if (result.success) {
                showToast('Variable deleted');
                const newSelected = new Set(state.selectedVars);
                newSelected.delete(name);
                state.selectedVars = newSelected;
                await this.loadEnvVars();
                return true;
            } else {
                showToast(result.error || 'Failed to delete', 'error');
                return false;
            }
        } catch (error) {
            showToast('Error deleting variable', 'error');
            return false;
        }
    }

    async deleteSelected() {
        if (state.selectedVars.size === 0 && !state.selectedExplorerVar) return;
        
        const varsToDelete: EnvVar[] = [];
        let folderName = '';

        if (state.selectedExplorerVar) {
            const v = getVarById(state.selectedExplorerVar);
            if (v) {
                varsToDelete.push(v);
            } else {
                // Folder selection in Explorer
                folderName = state.selectedExplorerVar;
                const folderPath = [...state.explorerPath, folderName].join('_');
                const varsInFolder = state.allEnvVars.filter(ev => ev.name.startsWith(folderPath + '_') || ev.name === folderPath);
                varsToDelete.push(...varsInFolder);
            }
        }

        // Add multi-selected variables
        state.selectedVars.forEach(name => {
            const v = getVarById(name);
            if (v && !varsToDelete.find(item => item.name === name)) {
                varsToDelete.push(v);
            }
        });

        if (varsToDelete.length === 0) return;

        const confirmMsg = folderName 
            ? `Are you sure you want to delete folder "${folderName}" and its ${varsToDelete.length} variables?`
            : `Are you sure you want to delete ${varsToDelete.length} selected item(s)?`;

        const confirmResult = await this.confirmAction(confirmMsg);
        if (!confirmResult) return;

        showLoading(true, 'Deleting items...');
        let successCount = 0;
        let failCount = 0;
        let lastError = '';

        for (const v of varsToDelete) {
            const result = await window.electronAPI.deleteEnvVar(v.name, v.isSystem);
            if (result.success) {
                successCount++;
            } else {
                failCount++;
                lastError = result.error || 'Unknown error';
            }
        }

        state.selectedVars.clear();
        state.selectedExplorerVar = null;
        await this.loadEnvVars();
        showLoading(false);

        if (failCount === 0) {
            showToast(`Deleted ${successCount} item(s)`);
        } else {
            showToast(`Deleted ${successCount} item(s), ${failCount} failed: ${lastError}`, 'error');
        }
    }

    async toggleProtection(name: string) {
        try {
            const result = await window.electronAPI.toggleProtectedVar(name);
            if (result.success) {
                if (result.isProtected) state.protectedVars.add(name);
                else state.protectedVars.delete(name);
                showToast(result.isProtected ? 'Variable protected' : 'Protection removed');
                state.notify();
                return true;
            }
        } catch (error) {
            showToast('Failed to toggle protection', 'error');
        }
        return false;
    }

    async duplicateVar(name: string) {
        const v = getVarById(name);
        if (!v) return;

        showLoading(true, `Duplicating ${name}...`);
        try {
            let newName = `${name}_copy`;
            let suffix = 1;
            while (getVarById(newName)) {
                newName = `${name}_copy${suffix++}`;
            }

            const result = await window.electronAPI.createEnvVar(newName, v.value, v.isSystem);
            if (result.success) {
                showToast(`Duplicated to ${newName}`);
                await this.loadEnvVars();
            } else {
                showToast(result.error || 'Failed to duplicate', 'error');
            }
        } catch (error) {
            showToast('Error duplicating variable', 'error');
        } finally {
            showLoading(false);
        }
    }

    async optimizeVar(name: string) {
        const v = getVarById(name);
        if (!v) return;

        showLoading(true, `Optimizing ${name}...`);
        try {
            const result = await window.electronAPI.optimizeVar(v.name, v.value);
            if (result.savings > 0) {
                showToast(`Optimized ${name}! Saved ${result.savings} bytes.`);
                await this.loadEnvVars();
                return true;
            } else {
                showToast(`${name} is already optimal`);
                return false;
            }
        } catch (error) {
            showToast('Failed to optimize variable', 'error');
            return false;
        } finally {
            showLoading(false);
        }
    }

    // Helper for simple confirmation
    public confirmAction(message: string): Promise<boolean> {
        if (this.modalManager) {
            return this.modalManager.confirm(message);
        }
        return new Promise((resolve) => {
            const res = confirm(message);
            resolve(res);
        });
    }
}

export const actionService = new ActionService();
