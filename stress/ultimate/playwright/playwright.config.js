
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.stress' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    workers: process.env.PLAYWRIGHT_WORKERS ? parseInt(process.env.PLAYWRIGHT_WORKERS) : 20,
    timeout: 90 * 1000,
    expect: { timeout: 30 * 1000 },
    retries: 1,

    reporter: [
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: 'playwright-results.json' }],
        ['list'],
    ],

    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
        navigationTimeout: 60 * 1000,
    },

    webServer: {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120 * 1000,
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: '../../../',
    },

    projects: [
        {
            name: 'desktop',
            use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } },
        },
        {
            name: 'mobile',
            use: {
                browserName: 'chromium',
                viewport: { width: 412, height: 915 },
                deviceScaleFactor: 2.6,
                isMobile: true,
                hasTouch: true,
            },
        },
    ],
});
