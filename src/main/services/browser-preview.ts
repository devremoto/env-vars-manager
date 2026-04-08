import * as http from 'http';
import { shell } from 'electron';

/**
 * Serves content to the default browser via a temporary local HTTP server.
 * This ensures high-fidelity rendering for different content types (JSON, CSV, Scripts).
 */
export function openInBrowserWithLocalServer(content: string, contentType: string, filename: string) {
    const server = http.createServer((_req: any, res: any) => {
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${filename}"`,
            'Access-Control-Allow-Origin': '*'
        });
        res.end(content);
    });

    server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        const port = addr?.port;
        if (port) {
            shell.openExternal(`http://127.0.0.1:${port}/${filename}`);
        }
    });

    // Auto-shutdown after 30 seconds to clean up
    setTimeout(() => {
        try { server.close(); } catch (e) { /* ignore */ }
    }, 30000);
}
