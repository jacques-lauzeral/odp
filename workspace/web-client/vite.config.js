import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    root: 'src',

    resolve: {
        alias: [
            // Redirect any import escaping above src/ into the shared source copy
            // Covers: ../../shared/src/... and ../shared/src/... from anywhere in src/
            {
                find: /^(\.\.\/)+shared\/src\//,
                replacement: resolve(__dirname, 'src/shared/src') + '/',
            },
        ],
    },

    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },

    server: {
        port: 3000,
        host: true,
        cors: true,
    },

    preview: {
        port: 3000,
        host: true,
        cors: true,
    },
});