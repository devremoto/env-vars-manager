import * as path from 'path';

export interface OptimizationResult {
    originalValue: string;
    optimizedValue: string;
    newVariables: Array<{ name: string; value: string }>;
    lengthReduced: number;
}

export function optimizeValue(name: string, value: string, currentVars: Record<string, string>): OptimizationResult {
    const isWindows = process.platform === 'win32';
    const separator = isWindows ? ';' : ':';
    const paths = value.split(separator).filter(p => p.trim());

    // Sort variables by value length descending to match longest prefixes first
    const sortedVars = Object.entries(currentVars)
        .filter(([vName, vVal]) => vVal.length > 5 && vName !== name)
        .sort((a, b) => b[1].length - a[1].length);

    const optimizedPaths = paths.map(originalPath => {
        let currentPath = originalPath.trim();
        let bestMatch = { name: '', length: 0 };

        for (const [vName, vValue] of sortedVars) {
            const normalizedVValue = normalizePath(vValue);
            const normalizedCurrent = normalizePath(currentPath);

            if (normalizedCurrent.startsWith(normalizedVValue)) {
                const remainder = currentPath.substring(vValue.length);
                if (remainder.startsWith('\\') || remainder.startsWith('/') || remainder === '') {
                    if (vValue.length > bestMatch.length) {
                        bestMatch = { name: vName, length: vValue.length };
                    }
                }
            }
        }

        if (bestMatch.name) {
            const vValue = currentVars[bestMatch.name];
            const remainder = currentPath.substring(vValue.length);
            return `%${bestMatch.name}%${remainder}`;
        }

        return currentPath;
    });

    const optimizedValue = optimizedPaths.join(separator);

    let lengthReduced = value.length - optimizedValue.length;

    // Optimization is allowed even if it doesn't reduce length (e.g. referencing another variable with same value)
    /* 
    if (optimizedPaths.length === 1) {
        const match = optimizedValue.match(/^%([^%]+)%$|^\$([a-zA-Z_][a-zA-Z0-9_]*)$/);
        if (match) {
            const varName = match[1] || match[2];
            if (currentVars[varName] === value) {
                lengthReduced = 0; // Effectively hide the optimize button/preview
            }
        }
    }
    */

    return {
        originalValue: value,
        optimizedValue,
        newVariables: [],
        lengthReduced
    };
}

function normalizePath(p: string): string {
    try {
        return path.normalize(p).toLowerCase().replace(/[\\/]$/, '');
    } catch (e) {
        return p.toLowerCase().replace(/[\\/]$/, '');
    }
}

export function suggestCustomPrefixes(allValues: string[]): Array<{ name: string; value: string }> {
    const isWindows = process.platform === 'win32';
    const separator = isWindows ? ';' : ':';
    const pathCounts: Record<string, number> = {};

    allValues.forEach(val => {
        if (!val) return;
        const parts = val.split(separator).filter(p => p.trim());
        parts.forEach(p => {
            const segments = p.split(/[\\/]/);
            for (let i = 1; i < segments.length; i++) {
                const prefix = segments.slice(0, i).join(isWindows ? '\\' : '/');
                if (prefix.length > 12) { // Long enough to be worth it
                    pathCounts[prefix] = (pathCounts[prefix] || 0) + 1;
                }
            }
        });
    });

    return Object.entries(pathCounts)
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => (b[0].length * b[1]) - (a[0].length * a[1]))
        .map(([prefix], index) => ({
            name: `PREFIX_${index + 1}`,
            value: prefix
        }))
        .slice(0, 5);
}
