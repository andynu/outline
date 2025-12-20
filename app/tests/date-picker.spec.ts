import { test, expect } from '@playwright/test';

test.describe('Date picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Ctrl+D opens date picker', async ({ page }) => {
    // Click on first editor to focus
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Ctrl+D to open date picker
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    // Check that date picker appears
    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible({ timeout: 3000 });
  });

  test('date picker has quick date buttons', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    // Check for quick date buttons
    await expect(page.locator('.quick-date').filter({ hasText: 'Today' })).toBeVisible();
    await expect(page.locator('.quick-date').filter({ hasText: 'Tomorrow' })).toBeVisible();
    await expect(page.locator('.quick-date').filter({ hasText: 'Next week' })).toBeVisible();
    await expect(page.locator('.quick-date').filter({ hasText: 'Clear' })).toBeVisible();
  });

  test('clicking Today sets date and shows badge', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Open date picker
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    // Click Today button
    await page.locator('.quick-date').filter({ hasText: 'Today' }).click();
    await page.waitForTimeout(100);

    // Date picker should close
    await expect(datePicker).not.toBeVisible();

    // Date badge should appear on the focused item
    const focusedItem = page.locator('.outline-item.focused');
    const dateBadge = focusedItem.locator('.date-badge');
    await expect(dateBadge).toBeVisible();
  });


  test('typing in date input parses natural language', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    // Type "tomorrow" in the input
    const dateInput = page.locator('.date-input');
    await dateInput.fill('tomorrow');
    await page.waitForTimeout(100);

    // Should show preview
    const preview = page.locator('.preview');
    await expect(preview).toBeVisible();
  });

  test('Enter submits typed date', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    const dateInput = page.locator('.date-input');
    await dateInput.fill('tomorrow');
    await page.waitForTimeout(100);

    // Press Enter to submit
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Date picker should close
    const datePicker = page.locator('.date-picker');
    await expect(datePicker).not.toBeVisible();

    // Date badge should appear
    const focusedItem = page.locator('.outline-item.focused');
    const dateBadge = focusedItem.locator('.date-badge');
    await expect(dateBadge).toBeVisible();
  });

  test('Escape closes date picker without saving', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+d');
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

    // No date badge should appear
    const focusedItem = page.locator('.outline-item.focused');
    const dateBadge = focusedItem.locator('.date-badge');
    await expect(dateBadge).not.toBeVisible();
  });

  test('clicking date badge opens date picker', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Set a date first
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    await page.locator('.quick-date').filter({ hasText: 'Today' }).click();
    await page.waitForTimeout(100);

    // Date badge should be visible
    const focusedItem = page.locator('.outline-item.focused');
    const dateBadge = focusedItem.locator('.date-badge');
    await expect(dateBadge).toBeVisible();

    // Click on date badge
    await dateBadge.click();
    await page.waitForTimeout(100);

    // Date picker should open again
    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();
  });

  test('Clear button removes date', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Set a date
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    const datePicker = page.locator('.date-picker');
    await expect(datePicker).toBeVisible();

    await page.locator('.quick-date').filter({ hasText: 'Today' }).click();
    await page.waitForTimeout(100);

    const focusedItem = page.locator('.outline-item.focused');
    const dateBadge = focusedItem.locator('.date-badge');
    await expect(dateBadge).toBeVisible();

    // Click on the date badge to reopen the date picker
    await dateBadge.click();
    await page.waitForTimeout(100);

    // Click Clear button
    const clearButton = page.locator('.quick-date').filter({ hasText: 'Clear' });
    await expect(clearButton).toBeVisible({ timeout: 3000 });
    await clearButton.click();
    await page.waitForTimeout(100);

    // Date badge should be gone
    await expect(dateBadge).not.toBeVisible();
  });
});
