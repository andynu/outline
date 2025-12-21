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
