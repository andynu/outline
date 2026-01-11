import { test, expect } from '@playwright/test';

test.describe('Edit menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('Edit menu is visible and clickable', async ({ page }) => {
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await expect(editMenu).toBeVisible();

    // Click to open
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    // Menu content should be visible
    await expect(editMenu.locator('.menu-content')).toBeVisible();
  });

  test('Edit menu contains Undo, Redo, and Delete Completed Items', async ({ page }) => {
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    // Check for menu items
    await expect(editMenu.locator('.menu-item-btn').filter({ hasText: 'Undo' })).toBeVisible();
    await expect(editMenu.locator('.menu-item-btn').filter({ hasText: 'Redo' })).toBeVisible();
    await expect(editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' })).toBeVisible();
  });

  test('Delete Completed Items is disabled when no completed items exist', async ({ page }) => {
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    // The button should be disabled since there are no completed items
    const deleteBtn = editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' });
    await expect(deleteBtn).toBeDisabled();
  });

  test('Delete Completed Items is enabled when completed items exist', async ({ page }) => {
    // First create a completed item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Create a new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type something, convert to checkbox, and mark it complete
    await page.keyboard.type('Task to complete');
    await page.keyboard.press('Control+Shift+x'); // Convert to checkbox
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+Enter'); // Mark complete
    await page.waitForTimeout(100);

    // Verify item is checked
    await expect(page.locator('.outline-item.checked')).toBeVisible();

    // Now open Edit menu
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    // The button should be enabled
    const deleteBtn = editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' });
    await expect(deleteBtn).not.toBeDisabled();
  });

  test('Delete Completed Items removes all completed items', async ({ page }) => {
    // Focus the first editor
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForSelector('.outline-item.focused');

    // Create a completed item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Task 1 - done');
    await page.keyboard.press('Control+Shift+x'); // Convert to checkbox
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+Enter'); // Mark complete
    await page.waitForTimeout(200);

    // Verify completed item exists
    await expect(page.locator('.outline-item.checked').first()).toBeVisible();

    // Count items before
    const countBefore = await page.locator('.outline-item').count();
    const checkedBefore = await page.locator('.outline-item.checked').count();

    // Open Edit menu and click Delete Completed Items
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    const deleteBtn = editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' });
    await deleteBtn.click();
    await page.waitForTimeout(500);

    // All completed items should be gone
    const checkedAfter = await page.locator('.outline-item.checked').count();
    expect(checkedAfter).toBe(0);

    // Total items should be reduced by the number of completed items
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore - checkedBefore);
  });

  test('Delete Completed Items button becomes disabled after deletion', async ({ page }) => {
    // Create a completed item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Task to delete');
    await page.keyboard.press('Control+Shift+x'); // Convert to checkbox
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+Enter'); // Mark complete
    await page.waitForTimeout(100);

    // Open Edit menu and click Delete Completed Items
    const editMenu = page.locator('.menu-dropdown').filter({ hasText: 'Edit' });
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    const deleteBtn = editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' });
    await expect(deleteBtn).not.toBeDisabled();
    await deleteBtn.click();
    await page.waitForTimeout(300);

    // Open menu again
    await editMenu.locator('.menu-trigger').click();
    await page.waitForTimeout(100);

    // Button should now be disabled
    const deleteBtnAfter = editMenu.locator('.menu-item-btn').filter({ hasText: 'Delete Completed Items' });
    await expect(deleteBtnAfter).toBeDisabled();
  });
});
