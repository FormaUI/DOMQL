import { defineConfig } from 'vitest/config';

// A path in the forward slashes Vite matches aliases by, decoded from its URL so a space in the checkout path resolves.
const resolved = path => decodeURIComponent(new URL(path, import.meta.url).pathname);

// The browser tests of what browser engines decide differently, run in Chromium, Firefox and WebKit: where a focus event inside a shadow root reaches and whether
// removing the focused element fires one, and where a box's scroll origin lies. `npm run test:engines` runs them.
export default defineConfig({
    resolve: {
        alias: [{ find: '#domql/', replacement: resolved('../src/') }],
    },
    test: {
        include: ['dom/FocusChain.browser.js', 'dom/ReversedScrolling.browser.js'],
        browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
        },
    },
});
