import { cpus } from 'node:os';
import { defineConfig } from 'vitest/config';

// A path in the forward slashes Vite matches aliases by, decoded from its URL so a space in the checkout path resolves.
const resolved = path => decodeURIComponent(new URL(path, import.meta.url).pathname);

// The machine's processor time so far, busy and in all, in milliseconds summed over its logical processors, which the browser cannot read: a workload reads it before and after a measurement for the load it ran under.
const processorTimes = () =>
    cpus().reduce(({ busy, total }, { times: { user, nice, sys, irq, idle } }) => ({ busy: busy + user + nice + sys + irq, total: total + user + nice + sys + irq + idle }), { busy: 0, total: 0 });

// How a watch's phases scale, and the workloads a design review named, timed in headless Chromium, outside the gate; `npm run scale` runs them, one file at a time, so no workload runs while another is timed.
// Collection is exposed and memory measured precisely, so a phase's memory is read once garbage is collected.
export default defineConfig({
    resolve: {
        alias: [
            { find: '#domql/', replacement: resolved('../src/') },
            // Nexo's sources, which the integration tests alone reach as `#nexo/`, through the linked checkout and never through the package's exports.
            { find: '#nexo/', replacement: resolved('../node_modules/@formaui-net/nexo/src/') },
        ],
    },
    test: {
        include: ['**/*.scale.js'],
        fileParallelism: false,
        browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            screenshotFailures: false,
            commands: { processorTimes },
            instances: [{ browser: 'chromium', launch: { args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] } }],
        },
    },
});
