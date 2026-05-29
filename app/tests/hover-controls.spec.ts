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

    // Button exists but should be invisible (opacity: 0) on unfocused item
    await expect(menuBtn).toBeAttached();
    await expect(menuBtn).toHaveCSS('opacity', '0');
  });

  test('hamburger menu button appears on hover', async ({ page }) => {
    // Scope to the item's OWN row/button with the direct-child combinator —
    // the first item is the root, so a descendant selector also matches every
    // nested child's .item-row/.hover-menu-btn (strict-mode violation).
    const firstItem = page.locator('.outline-container > .outline-item').first();
    const itemRow = firstItem.locator('> .item-row');
    const menuBtn = itemRow.locator('> .hover-menu-btn');

    // Hover over the item; the button fades in (opacity 0 -> 1)
    await itemRow.hover();

    // Button should be visible now
    await expect(menuBtn).toHaveCSS('opacity', '1');
  });

  test('clicking hamburger menu button opens context menu', async ({ page }) => {
    const firstItem = page.locator('.outline-container > .outline-item').first();
    const itemRow = firstItem.locator('> .item-row');
    const menuBtn = itemRow.locator('> .hover-menu-btn');

    // Hover so the button fades in, then click it
    await itemRow.hover();
    await expect(menuBtn).toHaveCSS('opacity', '1');
    await menuBtn.click();

    // Context menu should be visible
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();
  });

  test('controls appear on focused item', async ({ page }) => {
    const firstItem = page.locator('.outline-container > .outline-item').first();
    await firstItem.locator('> .item-row').click();
    await expect(page.locator('.outline-item.focused')).toHaveCount(1);

    // Hamburger button should be visible on the focused item
    const menuBtn = firstItem.locator('> .item-row > .hover-menu-btn');
    await expect(menuBtn).toHaveCSS('opacity', '1');
  });
});
