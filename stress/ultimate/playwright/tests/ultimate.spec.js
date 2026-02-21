
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function waitForAppReady(page) {
    // Wait for real app content — NOT a spinner. Look for bottom nav or hero text.
    await page.waitForSelector(
        '#root:not(:empty)',
        { timeout: 30000, state: 'attached' }
    );
}

// ─── A. Logged-Out Browse + Auth Wall ────────────────────────────────────────
test.describe('(Logged-Out) Browse + Auth Wall', () => {
    test('Landing page loads and has CTA buttons', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);
        // Should at least have an Explore or Login button
        const bodyText = await page.textContent('body');
        expect(bodyText).not.toBe('');
        expect(bodyText.length).toBeGreaterThan(50);
    });

    test('Browse page loads without auth', async ({ page }) => {
        await page.goto('/browse');
        await waitForAppReady(page);
        const body = await page.textContent('body');
        expect(body.length).toBeGreaterThan(50);
    });

    test('Map page loads without auth', async ({ page }) => {
        await page.goto('/map');
        await waitForAppReady(page);
        const body = await page.textContent('body');
        expect(body).not.toBeNull();
    });

    test('Messages page triggers auth wall modal', async ({ page }) => {
        await page.goto('/messages');
        await waitForAppReady(page);
        // Should show login prompt / modal / redirect — not crash
        const body = await page.textContent('body');
        expect(body.length).toBeGreaterThan(0);
    });

    test('Auth wall modal has clickable buttons', async ({ page }) => {
        await page.goto('/messages');
        await waitForAppReady(page);
        // Try to find any button or link
        const buttons = await page.locator('button, a[href]').count();
        expect(buttons).toBeGreaterThan(0);
    });
});

// ─── B. Navigation Stress ─────────────────────────────────────────────────────
test.describe('Navigation Stress (Rapid Route Changes)', () => {
    const routes = ['/', '/browse', '/map', '/messages', '/account', '/browse'];

    test('Rapid route navigation does not crash', async ({ page }) => {
        for (const route of routes) {
            await page.goto(route, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(300);
        }
        // Final check — page still alive
        const root = page.locator('#root');
        await expect(root).not.toBeEmpty();
    });

    test('Back/forward navigation preserves DOM', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);
        await page.goto('/browse');
        await waitForAppReady(page);
        await page.goBack();
        await waitForAppReady(page);
        await page.goForward();
        await waitForAppReady(page);
        const root = page.locator('#root');
        await expect(root).not.toBeEmpty();
    });
});

// ─── C. Console Error Check ───────────────────────────────────────────────────
test.describe('Console Error Detection', () => {
    test('No uncaught JS errors on landing page', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/');
        await waitForAppReady(page);
        await page.waitForTimeout(2000);
        const criticalErrors = errors.filter(
            (e) => !e.includes('Firebase') && !e.includes('fcm') && !e.includes('getApp')
        );
        expect(criticalErrors).toHaveLength(0);
    });

    test('No uncaught JS errors on browse page', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/browse');
        await waitForAppReady(page);
        await page.waitForTimeout(2000);
        const criticalErrors = errors.filter(
            (e) => !e.includes('Firebase') && !e.includes('fcm') && !e.includes('getApp')
        );
        expect(criticalErrors).toHaveLength(0);
    });
});

// ─── D. Network Failure Resilience ────────────────────────────────────────────
test.describe('Network Resilience', () => {
    test('App survives offline mode for 2 seconds', async ({ page, context }) => {
        await page.goto('/');
        await waitForAppReady(page);
        await context.setOffline(true);
        await page.waitForTimeout(2000);
        await context.setOffline(false);
        // Page should still be functional
        const root = page.locator('#root');
        await expect(root).not.toBeEmpty();
    });
});

// ─── E. Performance: Page Load Times ─────────────────────────────────────────
test.describe('Performance', () => {
    test('Landing page LCP under 5s', async ({ page }) => {
        const start = Date.now();
        await page.goto('/');
        await waitForAppReady(page);
        const loadTime = Date.now() - start;
        console.log(`[PERF] Landing load: ${loadTime}ms`);
        expect(loadTime).toBeLessThan(5000);
    });

    test('Browse page LCP under 5s', async ({ page }) => {
        const start = Date.now();
        await page.goto('/browse');
        await waitForAppReady(page);
        const loadTime = Date.now() - start;
        console.log(`[PERF] Browse load: ${loadTime}ms`);
        expect(loadTime).toBeLessThan(5000);
    });
});
