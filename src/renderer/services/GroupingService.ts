import { state } from '../state.js';
import { showToast, showLoading, splitVarName } from '../utils.js';
import { actionService } from './ActionService.js';

export class GroupingService {
    async handleAutoGroup() {
        showLoading(true, 'Analyzing variables...');
        try {
            const prefixMap: Record<string, string[]> = {};
            state.allEnvVars.forEach(v => {
                const parts = splitVarName(v.name);
                if (parts.length > 1) {
                    const prefix = parts[0];
                    if (!prefixMap[prefix]) prefixMap[prefix] = [];
                    prefixMap[prefix].push(v.name);
                }
            });

            const newGroups: Record<string, string[]> = { ...state.groups };
            let addedCount = 0;

            Object.entries(prefixMap).forEach(([prefix, names]) => {
                if (names.length >= 2) {
                    const groupName = prefix;
                    if (!state.groups[groupName]) {
                        newGroups[groupName] = names;
                        addedCount++;
                    }
                }
            });

            if (addedCount > 0) {
                const result = await window.electronAPI.saveGroups(newGroups);
                if (result.success) {
                    showToast(`Created ${addedCount} auto-groups`);
                    await actionService.loadEnvVars(true);
                } else {
                    showToast('Failed to save groups', 'error');
                }
            } else {
                showToast('No new groups identified');
            }
        } finally {
            showLoading(false);
        }
    }

    async createGroupFromSelection(groupName: string) {
        if (!groupName) return;
        const selectedNames = Array.from(state.selectedVars);
        if (selectedNames.length < 2) {
            showToast('Select at least 2 variables to group', 'warning');
            return;
        }

        // Remove these variables from any other groups they might belong to
        const newGroups: Record<string, string[]> = {};
        Object.entries(state.groups).forEach(([name, vars]) => {
            newGroups[name] = vars.filter(v => !selectedNames.includes(v));
        });

        // Add to new group
        newGroups[groupName] = selectedNames;

        showLoading(true, 'Creating group...');
        const result = await window.electronAPI.saveGroups(newGroups);
        if (result.success) {
            showToast(`Group "${groupName}" created`);
            state.selectedVars.clear();
            await actionService.loadEnvVars(true);
        } else {
            showToast(result.error || 'Failed to create group', 'error');
        }
        showLoading(false);
    }

    async ungroup(groupName: string) {
        if (!state.groups[groupName]) return;
        
        const newGroups = { ...state.groups };
        delete newGroups[groupName];

        showLoading(true, 'Removing group...');
        const result = await window.electronAPI.saveGroups(newGroups);
        if (result.success) {
            showToast(`Group "${groupName}" removed`);
            await actionService.loadEnvVars(true);
        } else {
            showToast('Failed to remove group', 'error');
        }
        showLoading(false);
    }

    async ungroupAll() {
        const count = Object.keys(state.groups).length;
        if (count === 0) {
            showToast('No groups to remove');
            return;
        }

        const confirm = await actionService.confirmAction(`Are you sure you want to remove all ${count} groups? This won't delete variables.`);
        if (!confirm) return;

        showLoading(true, 'Removing all groups...');
        const result = await window.electronAPI.saveGroups({});
        if (result.success) {
            showToast('All groups removed');
            await actionService.loadEnvVars(true);
        } else {
            showToast('Failed to remove all groups', 'error');
        }
        showLoading(false);
    }

    async ungroupSelected() {
        const groupKeys = Object.keys(state.groups);
        const selectedGroupNames = new Set<string>();

        // From selected folders
        Array.from(state.selectedFolders).forEach(f => {
            const normalized = f.replace(/\//g, '__');
            const normalizedAlt = f.replace(/\//g, ':');
            
            [normalized, normalizedAlt].forEach(n => {
                if (state.groups[n]) selectedGroupNames.add(n);
                if (state.groups[`${n} Vars`]) selectedGroupNames.add(`${n} Vars`);
                groupKeys.forEach(g => {
                    if (g.startsWith(n)) selectedGroupNames.add(g);
                });
            });
        });

        // From selected variables
        Array.from(state.selectedVars).forEach(v => {
            groupKeys.forEach(g => {
                if (state.groups[g].includes(v)) {
                    selectedGroupNames.add(g);
                }
            });
        });

        if (selectedGroupNames.size === 0) return;

        const confirmText = selectedGroupNames.size === 1 
            ? `Remove group "${Array.from(selectedGroupNames)[0]}"?` 
            : `Remove ${selectedGroupNames.size} selected groups?`;
            
        const confirm = await actionService.confirmAction(confirmText);
        if (!confirm) return;

        showLoading(true, 'Removing groups...');
        const newGroups = { ...state.groups };
        selectedGroupNames.forEach(name => delete newGroups[name]);

        const result = await window.electronAPI.saveGroups(newGroups);
        if (result.success) {
            showToast(`${selectedGroupNames.size} group(s) removed`);
            state.selectedFolders.clear();
            await actionService.loadEnvVars(true);
        } else {
            showToast('Failed to remove selected groups', 'error');
        }
        showLoading(false);
    }
}

export const groupingService = new GroupingService();
