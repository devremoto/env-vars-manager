import { MainRenderer } from './MainRenderer.js';
import { showToast } from './utils.js';

// Global error handler for debugging
window.addEventListener('error', (event) => {
    console.error('Unhandled error:', event.error);
    showToast(`Error: ${event.message}`, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
    showToast(`Promise Error: ${event.reason}`, 'error');
});

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    try {
        new MainRenderer();
    } catch (error: any) {
        console.error('Failed to initialize MainRenderer:', error);
        showToast(`Init Error: ${error.message}`, 'error');
    }
});
