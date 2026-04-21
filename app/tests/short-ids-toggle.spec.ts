import { test, expect } from '@playwright/test';

test.describe('Show Short IDs toolbar toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item');

    // Reset the setting to hidden to start from a known state.
    await page.evaluate(() => {
      const raw = localStorage.getItem('outline-settings');
      const settings = raw ? JSON.parse(raw) : {};
      settings.showShortIds = false;
      localStorage.setItem('outline-settings', JSON.stringify(settings));
    });
    await page.reload();
    await page.waitForSelector('.outline-item');
  });

  test('toolbar button is visible', async ({ page }) => {
    const btn = page.locator('.toolbar-btn.short-ids-toggle');
    await expect(btn).toBeVisible();
  });

  test('clicking toggles short-id-badge visibility and active state', async ({ page }) => {
    const btn = page.locator('.toolbar-btn.short-ids-toggle');

    // Initially inactive; no badges visible.
    await expect(btn).not.toHaveClass(/active/);
    await expect(page.locator('.short-id-badge').first()).toHaveCount(0);

    // Click to show.
    await btn.click();
    await page.waitForTimeout(100);
    await expect(btn).toHaveClass(/active/);
    await expect(page.locator('.short-id-badge').first()).toBeVisible();

    // Click to hide.
    await btn.click();
    await page.waitForTimeout(100);
    await expect(btn).not.toHaveClass(/active/);
    await expect(page.locator('.short-id-badge')).toHaveCount(0);
  });

  test('tooltip reflects current state', async ({ page }) => {
    const btn = page.locator('.toolbar-btn.short-ids-toggle');

    await expect(btn).toHaveAttribute('title', 'Show short IDs');

    await btn.click();
    await page.waitForTimeout(100);

    await expect(btn).toHaveAttribute('title', 'Hide short IDs');
  });
});
