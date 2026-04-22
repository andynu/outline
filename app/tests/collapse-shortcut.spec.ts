import { test, expect } from '@playwright/test';

test.describe('Ctrl+. collapse shortcut', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Ctrl+. toggles collapse on the focused item', async ({ page }) => {
    // "Getting Started" has children in the initial seed document
    const parentRow = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();
    const parentEditor = parentRow.locator('.editor-wrapper').first();

    // Focus the parent
    await parentEditor.click();
    await page.waitForTimeout(100);

    // A known child of Getting Started
    const childItem = page.locator('.editor-wrapper').filter({ hasText: 'Press Enter to create a new item' });
    await expect(childItem).toBeVisible();

    const bullet = parentRow.locator('> .item-row .bullet');
    await expect(bullet).toHaveText('●');

    // Press Ctrl+. to collapse
    await page.keyboard.press('Control+.');
    await page.waitForTimeout(150);

    await expect(childItem).not.toBeVisible();
    await expect(bullet).toHaveText('◉');

    // Press Ctrl+. again to expand
    await page.keyboard.press('Control+.');
    await page.waitForTimeout(150);

    await expect(childItem).toBeVisible();
    await expect(bullet).toHaveText('●');
  });
});
