import { defineConfig } from 'vitest/config';

// A path in the forward slashes Vite matches aliases by, decoded from its URL so a space in the checkout path resolves.
const resolved = path => decodeURIComponent(new URL(path, import.meta.url).pathname);

// DOMQL's scripts, reached as `#domql/`.
export default defineConfig({
    resolve: {
        alias: [
            { find: '#domql/', replacement: resolved('../src/') },
            // Lexica's sources, which the integration tests alone reach as `#lexica/`, through the linked checkout and never through the package's exports.
            { find: '#lexica/', replacement: resolved('../node_modules/@formaui/lexica/src/') },
        ],
    },
    test: {
        environment: 'happy-dom',
        include: ['**/*.test.js'],
    },
});
