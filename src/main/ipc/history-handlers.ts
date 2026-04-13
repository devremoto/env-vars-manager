import { ipcMain } from 'electron';
import * as os from 'os';
import { getHistory, getHistoryById, logHistory, deleteHistory, deleteHistoryByDay, upsertVariable, getVariableByName } from '../../db';
import { SystemProfileService } from '../services/system-profile-service';

export class HistoryHandlers {
    static register() {
        ipcMain.handle('get-var-history', async (_event, varName) => {
            return getHistory(varName);
        });

        ipcMain.handle('restore-var', async (_event, historyId) => {
            const record = await getHistoryById(historyId);
            if (!record) throw new Error('Invalid history record');

            const valToRestore = (record.operation === 'UPDATE' || record.operation === 'RESTORE' || record.operation === 'OPTIMIZE')
                ? record.old_value
                : (record.new_value !== null ? record.new_value : record.old_value);

            if (valToRestore === null) throw new Error('This record has no value to restore');

            const { variable_name } = record;
            if (process.platform === 'win32') {
                await SystemProfileService.setRegistryValue(variable_name, valToRestore, false);
            } else {
                SystemProfileService.updateShellProfile(SystemProfileService.getProfilePath(), variable_name, valToRestore);
            }

            process.env[variable_name] = valToRestore;
            await logHistory(variable_name, 'RESTORE', record.new_value, valToRestore, !!record.was_protected, historyId);
            await upsertVariable(variable_name, valToRestore, 'user', !!record.was_protected);

            return { success: true };
        });

        ipcMain.handle('delete-history', async (_event, ids) => {
            await deleteHistory(ids);
            return { success: true };
        });

        ipcMain.handle('delete-history-by-day', async (_event, dayISO) => {
            const deleted = await deleteHistoryByDay(dayISO);
            return { success: true, count: deleted };
        });
    }
}
