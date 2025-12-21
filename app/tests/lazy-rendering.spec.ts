import { test, expect } from '@playwright/test';

test.describe('Lazy rendering of collapsed nodes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('children of collapsed nodes are not rendered', async ({ page }) => {
    // First create a child to make an item collapsible
    const firstItem = page.locator('.outline-container > .outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Create a child item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child item');
    await page.waitForTimeout(100);

    // Go back to parent
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Count items in the first item's subtree (should have 1 child visible)
    const childrenWrapper = firstItem.locator('.children-wrapper');
    await expect(childrenWrapper).toBeVisible();

    const childItems = firstItem.locator('.children > .outline-item');
    await expect(childItems).toHaveCount(1);

    // Collapse the parent
    const expandBtn = firstItem.locator('.expand-btn');
    await expandBtn.click();
    await page.waitForTimeout(100);

    // The children-wrapper should no longer be in the DOM
    await expect(childrenWrapper).not.toBeVisible();

    // Verify children-wrapper is completely removed, not just hidden
    const wrapperCount = await firstItem.locator('.children-wrapper').count();
    expect(wrapperCount).toBe(0);
  });

  test('children are rendered when node is expanded', async ({ page }) => {
    // First create a child
    const firstItem = page.locator('.outline-container > .outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child item');
    await page.waitForTimeout(100);

    // Go back to parent
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Collapse
    const expandBtn = firstItem.locator('.expand-btn');
    await expandBtn.click();
    await page.waitForTimeout(100);

    // Verify collapsed
    await expect(expandBtn).toHaveClass(/collapsed/);
    const wrapperCount = await firstItem.locator('.children-wrapper').count();
    expect(wrapperCount).toBe(0);

    // Now expand
    await expandBtn.click();
    await page.waitForTimeout(100);

    // Children should be rendered again
    const childrenWrapper = firstItem.locator('.children-wrapper');
    await expect(childrenWrapper).toBeVisible();

    const childItems = firstItem.locator('.children > .outline-item');
    await expect(childItems).toHaveCount(1);
  });

  test('deeply nested collapsed children are not rendered', async ({ page }) => {
    // Create a hierarchy: parent > child > grandchild
    const firstItem = page.locator('.outline-container > .outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Create child
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child');
    await page.waitForTimeout(100);

    // Create grandchild
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.keyboard.type('Grandchild');
    await page.waitForTimeout(100);

    // Count all outline items in the first item's subtree
    let nestedItems = await firstItem.locator('.outline-item').count();
    expect(nestedItems).toBe(2); // child + grandchild

    // Go to parent and collapse it
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Get the direct expand button (not nested ones)
    const expandBtn = firstItem.locator('> .item-row > .expand-btn');
    await expandBtn.click();
    await page.waitForTimeout(100);

    // All nested items should be removed from DOM
    nestedItems = await firstItem.locator('.outline-item').count();
    expect(nestedItems).toBe(0);
  });
});
