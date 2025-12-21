import { test, expect } from '@playwright/test';

test.describe('Lazy rendering of collapsed nodes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('children of collapsed nodes are not rendered', async ({ page }) => {
    // "Getting Started" has children in the demo data
    const parentItem = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();
    const bullet = parentItem.locator('.bullet');

    // Verify the parent has children (has-children class on bullet)
    await expect(bullet).toHaveClass(/has-children/);
    await expect(bullet).not.toHaveClass(/collapsed/);

    // Children should be visible - look for known child items
    const childItems = page.locator('.outline-item').filter({ hasText: 'Press Enter' });
    await expect(childItems.first()).toBeVisible();

    // Collapse the parent by clicking the bullet
    await bullet.click();
    await page.waitForTimeout(100);

    // The bullet should now show collapsed state
    await expect(bullet).toHaveClass(/collapsed/);

    // Children should no longer be visible (filtered from flat list)
    await expect(childItems.first()).not.toBeVisible();
  });

  test('children are rendered when node is expanded', async ({ page }) => {
    // "Getting Started" has children
    const parentItem = page.locator('.outline-item').filter({ hasText: 'Getting Started' }).first();
    const bullet = parentItem.locator('.bullet');

    // Collapse first
    await bullet.click();
    await page.waitForTimeout(100);
    await expect(bullet).toHaveClass(/collapsed/);

    // Children should not be visible
    const childItems = page.locator('.outline-item').filter({ hasText: 'Press Enter' });
    await expect(childItems.first()).not.toBeVisible();

    // Expand by clicking the bullet again
    await bullet.click();
    await page.waitForTimeout(100);

    // Children should be rendered again
    await expect(bullet).not.toHaveClass(/collapsed/);
    await expect(childItems.first()).toBeVisible();
  });

  test('deeply nested collapsed children are not rendered', async ({ page }) => {
    // Create a hierarchy: parent > child > grandchild
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Test Parent');
    await page.waitForTimeout(100);

    // Create child
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Test Child');
    await page.waitForTimeout(100);

    // Create grandchild
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Test Grandchild');
    await page.waitForTimeout(100);

    // Verify all items are visible
    await expect(page.locator('.outline-item').filter({ hasText: 'Test Parent' })).toBeVisible();
    await expect(page.locator('.outline-item').filter({ hasText: 'Test Child' })).toBeVisible();
    await expect(page.locator('.outline-item').filter({ hasText: 'Test Grandchild' })).toBeVisible();

    // Navigate to parent and collapse it
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Collapse the parent
    const parentItem = page.locator('.outline-item').filter({ hasText: 'Test Parent' }).first();
    const bullet = parentItem.locator('.bullet');
    await bullet.click();
    await page.waitForTimeout(100);

    // All nested items should be removed from DOM
    await expect(page.locator('.outline-item').filter({ hasText: 'Test Child' })).not.toBeVisible();
    await expect(page.locator('.outline-item').filter({ hasText: 'Test Grandchild' })).not.toBeVisible();

    // Parent should still be visible
    await expect(page.locator('.outline-item').filter({ hasText: 'Test Parent' })).toBeVisible();
  });
});
