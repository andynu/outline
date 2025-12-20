import { test, expect } from '@playwright/test';

test.describe('Context menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('right-click opens context menu', async ({ page }) => {
    // Right-click on first item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    // Check that context menu appears
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible({ timeout: 3000 });
  });

  test('context menu shows expected items', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();

    // Check for expected menu items
    await expect(page.locator('.menu-item').filter({ hasText: 'Mark Complete' })).toBeVisible();
    await expect(page.locator('.menu-item').filter({ hasText: 'Convert to Checkbox' })).toBeVisible();
    await expect(page.locator('.menu-item').filter({ hasText: 'Indent' })).toBeVisible();
    await expect(page.locator('.menu-item').filter({ hasText: 'Outdent' })).toBeVisible();
    // Check for Delete menu item (not "Delete Completed Children")
    await expect(page.locator('.menu-item .label').filter({ hasText: /^Delete$/ })).toBeVisible();
  });

  test('context menu shows keyboard shortcuts', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();

    // Check for shortcut hints
    const shortcuts = page.locator('.shortcut');
    const shortcutTexts = await shortcuts.allTextContents();

    expect(shortcutTexts).toContain('Ctrl+Enter');
    expect(shortcutTexts).toContain('Ctrl+Shift+C');
    expect(shortcutTexts).toContain('Tab');
    expect(shortcutTexts).toContain('Shift+Tab');
  });

  test('clicking outside closes context menu', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();

    // Click outside the menu
    await page.click('body', { position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);

    await expect(contextMenu).not.toBeVisible();
  });

  test('Escape closes context menu', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    await expect(contextMenu).not.toBeVisible();
  });

  test('Mark Complete action works', async ({ page }) => {
    // First convert item to checkbox so we can mark it complete
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    await page.locator('.menu-item').filter({ hasText: 'Convert to Checkbox' }).click();
    await page.waitForTimeout(100);

    // Menu should close after action
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).not.toBeVisible();

    // Now right-click again and mark complete
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    await page.locator('.menu-item').filter({ hasText: 'Mark Complete' }).click();
    await page.waitForTimeout(100);

    // Item should be marked as checked
    await expect(firstItem).toHaveClass(/checked/);
  });

  test('Convert to Checkbox action works', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    // Click Convert to Checkbox
    await page.locator('.menu-item').filter({ hasText: 'Convert to Checkbox' }).click();
    await page.waitForTimeout(100);

    // Menu should close
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).not.toBeVisible();

    // Item should now have checkbox
    const checkbox = firstItem.locator('.checkbox-btn');
    await expect(checkbox).toBeVisible();
  });

  test('Indent menu item can be clicked', async ({ page }) => {
    // Focus on an item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Right-click to show context menu
    const focusedItem = page.locator('.outline-item.focused');
    await focusedItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();

    // Click Indent menu item
    await page.locator('.menu-item').filter({ hasText: 'Indent' }).click();
    await page.waitForTimeout(100);

    // Menu should close after clicking
    await expect(contextMenu).not.toBeVisible();
  });

  test('Delete action removes item', async ({ page }) => {
    // Create a new item to delete
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('item to delete');
    await page.waitForTimeout(100);

    // Get current item count
    const initialCount = await page.locator('.outline-item').count();

    // Right-click and select Delete
    const focusedItem = page.locator('.outline-item.focused');
    await focusedItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    // Click the Delete menu item (by its label, not "Delete Completed Children")
    await page.locator('.menu-item .label').filter({ hasText: /^Delete$/ }).click();
    await page.waitForTimeout(200);

    // Item count should decrease
    const finalCount = await page.locator('.outline-item').count();
    expect(finalCount).toBeLessThan(initialCount);
  });

  test('menu closes after action is selected', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();

    // Click any action
    await page.locator('.menu-item').filter({ hasText: 'Mark Complete' }).click();
    await page.waitForTimeout(100);

    // Menu should close
    await expect(contextMenu).not.toBeVisible();
  });

  test('menu has separators', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();

    // Should have separators
    const separators = page.locator('.context-menu .separator');
    const separatorCount = await separators.count();
    expect(separatorCount).toBeGreaterThan(0);
  });
});
