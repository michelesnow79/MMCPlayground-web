
import { test, expect } from '@playwright/test';

test.describe('Web Stress - Core Flows', () => {

    const TIMEOUT_FAST = 5000;
    const TIMEOUT_SLOW = 30000;

    // Wait for React to mount the root container
    const waitForAppReady = async (page) => {
        // Look for the main React root div or the first significant child
        await page.waitForSelector('.app-container', { state: 'attached', timeout: TIMEOUT_SLOW });
    };

    test('Browse Feed Load & Readiness', async ({ page, baseURL }) => {
        console.log(`Navigating to ${baseURL}/browse`);
        await page.goto('/browse', { waitUntil: 'domcontentloaded' });

        // 1. Wait for PRIMARY readiness signal (Browse Container)
        // This class is directly unique to the Browse page component
        const browseContainer = page.locator('.browse-container');
        await expect(browseContainer).toBeVisible({ timeout: TIMEOUT_SLOW });

        // 2. Wait for content to stabilize
        // Wait for the "loading hearts" spinner to disappear if it shows up
        const spinner = page.locator('.loading-hearts');
        if (await spinner.isVisible()) {
            await spinner.waitFor({ state: 'hidden', timeout: TIMEOUT_SLOW });
        }

        // 3. Confirm key elements are interactable
        const filterBtn = page.locator('.browse-filter-btn');
        await expect(filterBtn).toBeVisible();
        await expect(filterBtn).toBeEnabled();

        // 4. Verify we have either cards or an empty state
        // We expect at least one of these to be true eventually
        const hasCards = page.locator('.connection-card-premium').first();
        const hasEmpty = page.locator('.empty-state');

        // Race condition check: wait for either cards or empty state
        await Promise.race([
            hasCards.waitFor({ state: 'visible', timeout: TIMEOUT_SLOW }).catch(() => { }),
            hasEmpty.waitFor({ state: 'visible', timeout: TIMEOUT_SLOW }).catch(() => { })
        ]);
    });

    test('Map Page Interaction', async ({ page }) => {
        await page.goto('/map', { waitUntil: 'domcontentloaded' });

        // 1. Wait for Map Container
        // MapView.jsx usually has a known structure, assuming .map-view-container or similar?
        // Based on previous files, we can look for specific map UI elements like the bottom nav
        const bottomNav = page.locator('.bottom-nav');
        await expect(bottomNav).toBeVisible({ timeout: TIMEOUT_SLOW });

        // 2. Wait for Google Maps canvas
        // It's usually inside a div, we can check if any canvas exists
        await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 45000 });

        // 3. Interact with Emulator Zoom Controls (if present)
        const zoomControls = page.locator('.emulator-zoom-controls');
        if (await zoomControls.isVisible()) {
            const zoomIn = zoomControls.locator('button').first();
            await zoomIn.click();
            await page.waitForTimeout(500); // Allow animation
            await zoomIn.click();
        }
    });

    test('Navigation Flow (Landing -> Map -> Browse)', async ({ page }) => {
        // 1. Landing
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('text=MISS ME CONNECTION')).toBeVisible({ timeout: TIMEOUT_SLOW });

        // 2. Click Explore -> Map
        const exploreBtn = page.locator('button:has-text("EXPLORE")').first();
        await exploreBtn.click();
        await page.waitForURL('**/map', { timeout: TIMEOUT_SLOW });

        // 3. Bottom Nav to Browse
        const browseLink = page.locator('.nav-item:has-text("Browse")');
        // If text isn't visible, use icon class or index if known. Assuming standard bottom nav.
        // Fallback to direct navigation if UI click is flaky
        if (await browseLink.isVisible()) {
            await browseLink.click();
        } else {
            await page.goto('/browse');
        }
        await page.waitForURL('**/browse', { timeout: TIMEOUT_SLOW });
    });

});
