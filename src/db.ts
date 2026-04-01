import { open, Database } from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { app } from 'electron';

export interface DBEnvVar {
    id: string;
    name: string;
    value: string;
    scope: 'user' | 'system';
    created_at: string;
    updated_at: string;
}

export interface VarHistory {
    id: string;
    variable_name: string;
    operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'OPTIMIZE' | 'PROTECT' | 'UNPROTECT';
    old_value: string | null;
    new_value: string | null;
    was_protected: boolean;
    timestamp: string;
    restored_from_history_id: string | null;
}

let db: Database;

export async function initDB(): Promise<void> {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'history.db');

    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec('PRAGMA journal_mode = WAL');

    // Create Tables
    await db.exec(`
        CREATE TABLE IF NOT EXISTS EnvironmentVariables (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            value TEXT,
            scope TEXT CHECK(scope IN ('user', 'system')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS VariableHistory (
            id TEXT PRIMARY KEY,
            variable_name TEXT NOT NULL,
            operation TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            was_protected BOOLEAN DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            restored_from_history_id TEXT,
            FOREIGN KEY (restored_from_history_id) REFERENCES VariableHistory(id)
        );

        CREATE INDEX IF NOT EXISTS idx_history_var_name ON VariableHistory(variable_name);
    `);

    // Migration: Add was_protected to VariableHistory if missing
    try {
        await db.exec('ALTER TABLE VariableHistory ADD COLUMN was_protected BOOLEAN DEFAULT 0');
    } catch (e) {
        // Column probably exists
    }
}

export async function logHistory(
    varName: string,
    operation: VarHistory['operation'],
    oldValue: string | null,
    newValue: string | null,
    wasProtected: boolean = false,
    restoredId: string | null = null
): Promise<void> {
    const id = uuidv4();
    await db.run(`
        INSERT INTO VariableHistory (id, variable_name, operation, old_value, new_value, was_protected, restored_from_history_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, varName, operation, oldValue, newValue, wasProtected ? 1 : 0, restoredId]);
}

export async function getAllVariables(): Promise<DBEnvVar[]> {
    return await db.all<DBEnvVar[]>('SELECT * FROM EnvironmentVariables ORDER BY name ASC');
}

export async function getVariableByName(name: string): Promise<DBEnvVar | undefined> {
    return await db.get<DBEnvVar>('SELECT * FROM EnvironmentVariables WHERE name = ?', [name]);
}

export async function upsertVariable(name: string, value: string, scope: 'user' | 'system', wasProtected: boolean = false): Promise<void> {
    const existing = await getVariableByName(name);
    const now = new Date().toISOString();

    if (existing) {
        if (existing.value === value && existing.scope === scope) return;

        await db.run(`
            UPDATE EnvironmentVariables 
            SET value = ?, scope = ?, updated_at = ?
            WHERE name = ?
        `, [value, scope, now, name]);
        await logHistory(name, 'UPDATE', existing.value, value, wasProtected);
    } else {
        const id = uuidv4();
        await db.run(`
            INSERT INTO EnvironmentVariables (id, name, value, scope, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [id, name, value, scope, now, now]);
        await logHistory(name, 'CREATE', null, value, wasProtected);
    }
}

export async function deleteVariable(name: string, wasProtected: boolean = false): Promise<void> {
    const existing = await getVariableByName(name);
    if (!existing) return;

    await db.run('DELETE FROM EnvironmentVariables WHERE name = ?', [name]);
    await logHistory(name, 'DELETE', existing.value, null, wasProtected);
}

export async function deleteHistory(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM VariableHistory WHERE id IN (${placeholders})`, ids);
}

export async function getHistory(varName?: string): Promise<VarHistory[]> {
    if (varName) {
        return await db.all<VarHistory[]>('SELECT * FROM VariableHistory WHERE variable_name = ? ORDER BY timestamp DESC', [varName]);
    }
    return await db.all<VarHistory[]>('SELECT * FROM VariableHistory ORDER BY timestamp DESC');
}

export async function getHistoryById(id: string): Promise<VarHistory | undefined> {
    return await db.get<VarHistory>('SELECT * FROM VariableHistory WHERE id = ?', [id]);
}


