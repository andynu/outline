import { test, expect } from '@playwright/test';

test.describe('Hide completed toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('eyeball icon is visible in toolbar', async ({ page }) => {
    const eyeballBtn = page.locator('.toolbar-btn.hide-completed-toggle');
    await expect(eyeballBtn).toBeVisible();
  });

  test('clicking eyeball icon toggles hide completed state', async ({ page }) => {
    const eyeballBtn = page.locator('.toolbar-btn.hide-completed-toggle');

    // Initially should show open eye (not hiding completed)
    await expect(eyeballBtn).not.toHaveClass(/active/);

    // Click to hide completed items
    await eyeballBtn.click();
    await page.waitForTimeout(100);

    // Should now show eye with slash and have active class
    await expect(eyeballBtn).toHaveClass(/active/);

    // Click again to show completed items
    await eyeballBtn.click();
    await page.waitForTimeout(100);

    // Should be back to open eye
    await expect(eyeballBtn).not.toHaveClass(/active/);
  });

  test('tooltip shows correct state message', async ({ page }) => {
    const eyeballBtn = page.locator('.toolbar-btn.hide-completed-toggle');

    // Initially should say "Hide completed items"
    await expect(eyeballBtn).toHaveAttribute('title', /Hide completed items/);

    // Click to hide
    await eyeballBtn.click();
    await page.waitForTimeout(100);

    // Should now say "Show completed items"
    await expect(eyeballBtn).toHaveAttribute('title', /Show completed items/);
  });

  test('status bar shows filter indicator when hiding completed', async ({ page }) => {
    const eyeballBtn = page.locator('.toolbar-btn.hide-completed-toggle');
    const statusBar = page.locator('.status-bar');

    // Initially no filter indicator
    await expect(statusBar.locator('.filter-indicator')).not.toBeVisible();

    // Click to hide completed
    await eyeballBtn.click();
    await page.waitForTimeout(100);

    // Should show "(hiding completed)" in status bar
    await expect(statusBar.locator('.filter-indicator')).toBeVisible();
    await expect(statusBar.locator('.filter-indicator')).toHaveText('(hiding completed)');
  });

  test('Ctrl+Shift+H keyboard shortcut toggles hide completed', async ({ page }) => {
    const eyeballBtn = page.locator('.toolbar-btn.hide-completed-toggle');

    // Initially not active
    await expect(eyeballBtn).not.toHaveClass(/active/);

    // Press Ctrl+Shift+H
    await page.keyboard.press('Control+Shift+H');
    await page.waitForTimeout(100);

    // Should now be active
    await expect(eyeballBtn).toHaveClass(/active/);

    // Press again
    await page.keyboard.press('Control+Shift+H');
    await page.waitForTimeout(100);

    // Should be inactive again
    await expect(eyeballBtn).not.toHaveClass(/active/);
  });

  test('hides completed items when active', async ({ page }) => {
    // First create a completed item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Create a new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type something and mark it complete
    await page.keyboard.type('Completed task');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);

    // Verify item is checked
    const completedItem = page.locator('.outline-item.checked');
    await expect(completedItem).toBeVisible();

    // Now click eyeball to hide completed
    const eyeballBtn = page.locator('.toolbar-btn.hide-completed-toggle');
    await eyeballBtn.click();
    await page.waitForTimeout(200);

    // Completed item should be hidden
    await expect(completedItem).not.toBeVisible();

    // Click again to show
    await eyeballBtn.click();
    await page.waitForTimeout(200);

    // Completed item should be visible again
    await expect(page.locator('.outline-item.checked')).toBeVisible();
  });
});
