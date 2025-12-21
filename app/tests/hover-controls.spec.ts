import { test, expect } from '@playwright/test';

test.describe('Hover controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('hamburger menu button is hidden on non-focused, non-hovered items', async ({ page }) => {
    // The first item starts focused, so check a non-focused item
    // Use the second root-level item (not a child)
    const secondItem = page.locator('.outline-container > .outline-item').nth(1);
    const menuBtn = secondItem.locator('> .item-row > .hover-menu-btn');

    // Move mouse away from items
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);

    // Button exists but should be invisible (opacity: 0) on unfocused item
    await expect(menuBtn).toBeAttached();
    const opacity = await menuBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(0);
  });

  test('hamburger menu button appears on hover', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    const itemRow = firstItem.locator('.item-row');
    const menuBtn = firstItem.locator('.hover-menu-btn');

    // Hover over the item
    await itemRow.hover();
    await page.waitForTimeout(200);

    // Button should be visible now
    const opacity = await menuBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(1);
  });

  test('clicking hamburger menu button opens context menu', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    const itemRow = firstItem.locator('.item-row');
    const menuBtn = firstItem.locator('.hover-menu-btn');

    // Hover and click
    await itemRow.hover();
    await page.waitForTimeout(100);
    await menuBtn.click();
    await page.waitForTimeout(100);

    // Context menu should be visible
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();
  });

  test('expand button is hidden on non-focused, non-hovered expanded items', async ({ page }) => {
    // First create a child to make an item expandable
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Create child
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Focus away from the first item (to second item which is now a child)
    // The first item should have an expand button now

    // Focus the second root item instead
    const secondRootItem = page.locator('.outline-item').filter({ has: page.locator('> .item-row') }).nth(1);
    await secondRootItem.locator('.item-row').first().click();
    await page.waitForTimeout(100);

    // Move mouse completely away
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);

    // Get the expand button on the first item (which should be unfocused)
    const expandBtn = firstItem.locator('.expand-btn');
    await expect(expandBtn).toBeAttached();

    // Should be hidden when not hovered and not focused (and expanded)
    const opacity = await expandBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(0);
  });

  test('expand button shows on hover', async ({ page }) => {
    // Create a child first
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Focus a different item
    const secondRootItem = page.locator('.outline-item').filter({ has: page.locator('> .item-row') }).nth(1);
    await secondRootItem.locator('.item-row').first().click();
    await page.waitForTimeout(100);

    // Now hover over the first item (which has children and expand button)
    const itemRow = firstItem.locator('> .item-row');
    await itemRow.hover();
    await page.waitForTimeout(200);

    // Expand button should be visible
    const expandBtn = firstItem.locator('.expand-btn');
    const opacity = await expandBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(1);
  });

  test('expand button stays visible when item is collapsed', async ({ page }) => {
    // Create a child first
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Go to parent
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Collapse it
    const expandBtn = firstItem.locator('.expand-btn');
    await expandBtn.click();
    await page.waitForTimeout(100);

    // Move mouse away
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);

    // Expand button should still be visible (shows collapsed state)
    await expect(expandBtn).toHaveClass(/collapsed/);
    const opacity = await expandBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(1);
  });

  test('controls appear on focused item', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Hamburger button should be visible on focused item
    const menuBtn = firstItem.locator('.hover-menu-btn');
    const opacity = await menuBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(1);
  });
});
