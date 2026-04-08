import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export class PathService {
    private static _protectedVarsPath: string;
    private static _groupsPath: string;
    private static _environmentsPath: string;

    static initialize() {
        this._protectedVarsPath = path.join(app.getPath('userData'), 'protected-vars.json');
        if (!fs.existsSync(this._protectedVarsPath)) {
            fs.writeFileSync(this._protectedVarsPath, JSON.stringify([]), 'utf-8');
        }

        this._groupsPath = path.join(app.getPath('userData'), 'groups.json');
        if (!fs.existsSync(this._groupsPath)) {
            fs.writeFileSync(this._groupsPath, JSON.stringify({}), 'utf-8');
        }

        this._environmentsPath = path.join(app.getPath('userData'), 'environments.json');
        if (!fs.existsSync(this._environmentsPath)) {
            fs.writeFileSync(this._environmentsPath, JSON.stringify(['Development', 'Staging', 'Production']), 'utf-8');
        }
    }

    static get protectedVarsPath() { return this._protectedVarsPath; }
    static get groupsPath() { return this._groupsPath; }
    static get environmentsPath() { return this._environmentsPath; }
}
