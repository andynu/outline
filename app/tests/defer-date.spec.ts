import { test, expect } from '@playwright/test';

test.describe('Defer date', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Ctrl+Shift+D opens date picker in defer mode', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Ctrl+Shift+D to open date picker in defer mode
    await page.keyboard.press('Control+Shift+d');
    await page.waitForTimeout(100);

    // Date picker should appear
    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible({ timeout: 3000 });

    // The "Defer until" tab should be active
    const deferTab = page.locator('.date-picker-mode-tab').filter({ hasText: 'Defer until' });
    await expect(deferTab).toHaveClass(/active/);
  });

  test('Ctrl+D opens date picker in due mode', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible({ timeout: 3000 });

    // The "Due date" tab should be active
    const dueTab = page.locator('.date-picker-mode-tab').filter({ hasText: 'Due date' });
    await expect(dueTab).toHaveClass(/active/);
  });

  test('date picker has mode tabs for due and defer', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    // Both tabs should be present
    await expect(page.locator('.date-picker-mode-tab').filter({ hasText: 'Due date' })).toBeVisible();
    await expect(page.locator('.date-picker-mode-tab').filter({ hasText: 'Defer until' })).toBeVisible();
  });

  test('clicking Defer tab switches to defer mode', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Open in due mode
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    // Click the Defer tab
    const deferTab = page.locator('.date-picker-mode-tab').filter({ hasText: 'Defer until' });
    await deferTab.click();
    await page.waitForTimeout(100);

    // Defer tab should now be active
    await expect(deferTab).toHaveClass(/active/);

    // Quick dates should show defer-appropriate options (Tomorrow, Next week, Next month)
    await expect(page.locator('.quick-date').filter({ hasText: 'Next month' })).toBeVisible();
  });

  test('setting defer date shows defer badge', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Open date picker in defer mode
    await page.keyboard.press('Control+Shift+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    // Click Tomorrow to set a defer date
    await page.locator('.quick-date').filter({ hasText: 'Tomorrow' }).click();
    await page.waitForTimeout(200);

    // Date picker should close
    await expect(datePicker).not.toBeVisible();

    // Defer badge should appear on the focused item
    const focusedItem = page.locator('.outline-item.focused');
    const deferBadge = focusedItem.locator('.date-badge.defer');
    await expect(deferBadge).toBeVisible();
    await expect(deferBadge).toContainText('Defer:');
  });

  test('setting both due and defer dates shows both badges', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Set a due date first
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);
    await page.locator('.quick-date').filter({ hasText: 'Tomorrow' }).click();
    await page.waitForTimeout(300);

    // Re-focus the editor (clicking quick-date moves focus away)
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Now set a defer date
    await page.keyboard.press('Control+Shift+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible({ timeout: 3000 });

    await page.locator('.quick-date').filter({ hasText: 'Next week' }).click();
    await page.waitForTimeout(300);

    // Both badges should be visible
    const focusedItem = page.locator('.outline-item.focused');
    const deferBadge = focusedItem.locator('.date-badge.defer');
    const dueBadge = focusedItem.locator('.date-badge:not(.defer)');

    await expect(deferBadge).toBeVisible();
    await expect(dueBadge).toBeVisible();
  });

  test('Escape closes date picker without setting defer date', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+Shift+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    // Type something but press Escape
    const dateInput = page.locator('.date-input');
    await dateInput.fill('tomorrow');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Date picker should close
    await expect(datePicker).not.toBeVisible();

    // No defer badge should appear
    const focusedItem = page.locator('.outline-item.focused');
    const deferBadge = focusedItem.locator('.date-badge.defer');
    await expect(deferBadge).not.toBeVisible();
  });

  test('clear button removes defer date', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Set a defer date
    await page.keyboard.press('Control+Shift+d');
    await page.waitForTimeout(100);
    await page.locator('.quick-date').filter({ hasText: 'Tomorrow' }).click();
    await page.waitForTimeout(200);

    // Verify defer badge exists
    const focusedItem = page.locator('.outline-item.focused');
    const deferBadge = focusedItem.locator('.date-badge.defer');
    await expect(deferBadge).toBeVisible();

    // Click the defer badge to reopen picker
    await deferBadge.click();
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    // Click Clear button
    await page.locator('.quick-date').filter({ hasText: 'Clear' }).click();
    await page.waitForTimeout(200);

    // Defer badge should be gone
    await expect(deferBadge).not.toBeVisible();
  });
});
