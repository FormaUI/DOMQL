import { defineConfig } from 'vitest/config';

// A path in the forward slashes Vite matches aliases by, decoded from its URL so a space in the checkout path resolves.
const resolved = path => decodeURIComponent(new URL(path, import.meta.url).pathname);

// How a watch's phases scale, timed in headless Chromium, outside the gate; `npm run scale` runs them. Collection is exposed and memory measured precisely, so a phase's memory is read once garbage is collected.
export default defineConfig({
    resolve: {
        alias: [
            { find: '#domql/', replacement: resolved('../src/') },
            // Lexica's sources, which the integration tests alone reach as `#lexica/`, through the linked checkout and never through the package's exports.
            { find: '#lexica/', replacement: resolved('../node_modules/@formaui/lexica/src/') },
        ],
    },
    test: {
        include: ['Domql.scale.js'],
        browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium', launch: { args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] } }],
        },
    },
});
