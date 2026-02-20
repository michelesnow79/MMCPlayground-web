
// Playwright config for stress testing
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env.stress' });

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    // Use more workers to simulate "stress" load
    workers: process.env.PLAYWRIGHT_WORKERS ? parseInt(process.env.PLAYWRIGHT_WORKERS) : 5, // Reduced default for stability

    // GLOBAL TIMEOUTS
    timeout: 90 * 1000,
    expect: {
        timeout: 30 * 1000, // Wait up to 30s for an element
    },

    retries: 2, // Retry flaky tests up to 2 times

    reporter: [
        ['html', { outputFolder: '../out/playwright-report' }],
        ['json', { outputFile: '../out/playwright_report.json' }],
        ['list']
    ],

    use: {
        // Collect specific trace for failed runs only
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
        baseURL: process.env.BASE_URL || 'http://localhost:5173',
        navigationTimeout: 60 * 1000,
    },

    // Ensure the dev server is running
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120 * 1000, // 2 minutes to start
        stdout: 'pipe',
        stderr: 'pipe',
    },

    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                viewport: { width: 412, height: 915 }, // Mobile dimensions (Pixel 7-ish)
                deviceScaleFactor: 2.6,
                isMobile: true,
                hasTouch: true,
            },
        },
    ],
});
