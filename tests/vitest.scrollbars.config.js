import { defineConfig } from 'vitest/config';

// A path in the forward slashes Vite matches aliases by, decoded from its URL so a space in the checkout path resolves.
const resolved = path => decodeURIComponent(new URL(path, import.meta.url).pathname);

// The tests that need a viewport's scrollbars to take up its room, run in headless Chromium without the argument that hides them; `npm run test:scrollbars` runs them.
export default defineConfig({
    resolve: {
        alias: [
            { find: '#domql/', replacement: resolved('../src/') },
            // Lexica's sources, which the integration tests alone reach as `#lexica/`, through the linked checkout and never through the package's exports.
            { find: '#lexica/', replacement: resolved('../node_modules/@formaui/lexica/src/') },
        ],
    },
    test: {
        include: ['**/*.scrollbars.js'],
        browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium', launch: { ignoreDefaultArgs: ['--hide-scrollbars'] } }],
        },
    },
});
