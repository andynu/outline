import { test, expect } from '@playwright/test';

test.describe('Short IDs assigned on node creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item');

    // Enable Show Short IDs so badges render.
    await page.evaluate(() => {
      const raw = localStorage.getItem('outline-settings');
      const settings = raw ? JSON.parse(raw) : {};
      settings.showShortIds = true;
      localStorage.setItem('outline-settings', JSON.stringify(settings));
    });
    await page.reload();
    await page.waitForSelector('.outline-item');
  });

  test('newly created item has a short-id-badge immediately (no reload)', async ({ page }) => {
    // Confirm existing items already have badges.
    const initialBadges = await page.locator('.short-id-badge').count();
    expect(initialBadges).toBeGreaterThan(0);

    // Click into the first editor and press Enter to create a sibling.
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    const itemsBefore = await page.locator('.outline-item').count();

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // A new item exists.
    const itemsAfter = await page.locator('.outline-item').count();
    expect(itemsAfter).toBe(itemsBefore + 1);

    // Every rendered item should have a short-id-badge with non-empty text —
    // including the new one, without needing to reload.
    const badges = page.locator('.short-id-badge');
    await expect(badges).toHaveCount(itemsAfter);

    const badgeTexts = await badges.allInnerTexts();
    for (const t of badgeTexts) {
      expect(t.trim()).toMatch(/^[0-9a-z]{4}$/);
    }
  });
});
