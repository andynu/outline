import { test, expect } from '@playwright/test';

test.describe('Recurrence picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Ctrl+R opens recurrence picker', async ({ page }) => {
    // Click on first editor to focus
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Ctrl+R to open recurrence picker
    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    // Check that recurrence picker appears
    const recurrencePicker = page.locator('.recurrence-picker');
    await expect(recurrencePicker).toBeVisible({ timeout: 3000 });
  });

  test('recurrence picker has frequency options', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    const recurrencePicker = page.locator('.recurrence-picker');
    await expect(recurrencePicker).toBeVisible();

    // Check for frequency select
    const frequencySelect = page.locator('.frequency-select');
    await expect(frequencySelect).toBeVisible();

    // Check that all options are available
    await expect(frequencySelect).toContainText('Does not repeat');
    const options = await frequencySelect.locator('option').allTextContents();
    expect(options).toContain('Daily');
    expect(options).toContain('Weekly');
    expect(options).toContain('Monthly');
    expect(options).toContain('Yearly');
  });

  test('selecting frequency shows interval input', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    // Select "Daily"
    const frequencySelect = page.locator('.frequency-select');
    await frequencySelect.selectOption('daily');
    await page.waitForTimeout(100);

    // Interval input should appear
    const intervalInput = page.locator('.interval-input');
    await expect(intervalInput).toBeVisible();
  });

  test('selecting weekly shows weekday buttons', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    // Select "Weekly"
    const frequencySelect = page.locator('.frequency-select');
    await frequencySelect.selectOption('weekly');
    await page.waitForTimeout(100);

    // Weekday buttons should appear
    const weekdayGrid = page.locator('.weekday-grid');
    await expect(weekdayGrid).toBeVisible();

    // Should have Mon-Sun buttons
    await expect(page.locator('.weekday-btn').filter({ hasText: 'Mon' })).toBeVisible();
    await expect(page.locator('.weekday-btn').filter({ hasText: 'Tue' })).toBeVisible();
    await expect(page.locator('.weekday-btn').filter({ hasText: 'Wed' })).toBeVisible();
    await expect(page.locator('.weekday-btn').filter({ hasText: 'Thu' })).toBeVisible();
    await expect(page.locator('.weekday-btn').filter({ hasText: 'Fri' })).toBeVisible();
    await expect(page.locator('.weekday-btn').filter({ hasText: 'Sat' })).toBeVisible();
    await expect(page.locator('.weekday-btn').filter({ hasText: 'Sun' })).toBeVisible();
  });

  test('clicking weekday toggles selection', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    const frequencySelect = page.locator('.frequency-select');
    await frequencySelect.selectOption('weekly');
    await page.waitForTimeout(100);

    const monBtn = page.locator('.weekday-btn').filter({ hasText: 'Mon' });

    // Initially not selected
    await expect(monBtn).not.toHaveClass(/selected/);

    // Click to select
    await monBtn.click();
    await page.waitForTimeout(50);

    await expect(monBtn).toHaveClass(/selected/);

    // Click again to deselect
    await monBtn.click();
    await page.waitForTimeout(50);

    await expect(monBtn).not.toHaveClass(/selected/);
  });

  test('preview text updates with frequency', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    const preview = page.locator('.preview');

    // Initially shows "No recurrence"
    await expect(preview).toContainText('No recurrence');

    // Select Daily
    const frequencySelect = page.locator('.frequency-select');
    await frequencySelect.selectOption('daily');
    await page.waitForTimeout(100);

    await expect(preview).toContainText('Daily');

    // Select Weekly
    await frequencySelect.selectOption('weekly');
    await page.waitForTimeout(100);

    await expect(preview).toContainText('Weekly');
  });

  test('preview text shows weekly days', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    const frequencySelect = page.locator('.frequency-select');
    await frequencySelect.selectOption('weekly');
    await page.waitForTimeout(100);

    // Select Monday
    await page.locator('.weekday-btn').filter({ hasText: 'Mon' }).click();
    await page.waitForTimeout(50);

    const preview = page.locator('.preview');
    await expect(preview).toContainText('Mon');
  });

  test('Apply button saves recurrence', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    // Select Daily
    const frequencySelect = page.locator('.frequency-select');
    await frequencySelect.selectOption('daily');
    await page.waitForTimeout(100);

    // Click Apply
    await page.locator('.btn-apply').click();
    await page.waitForTimeout(100);

    // Picker should close
    const recurrencePicker = page.locator('.recurrence-picker');
    await expect(recurrencePicker).not.toBeVisible();

    // Recurrence indicator should appear on item
    const focusedItem = page.locator('.outline-item.focused');
    const recurrenceIndicator = focusedItem.locator('.recurrence-indicator');
    await expect(recurrenceIndicator).toBeVisible();
  });

  test('clicking outside closes picker', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    const recurrencePicker = page.locator('.recurrence-picker');
    await expect(recurrencePicker).toBeVisible();

    // Click outside the picker
    await page.click('body', { position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);

    // Picker should close
    await expect(recurrencePicker).not.toBeVisible();

    // No recurrence indicator should appear
    const focusedItem = page.locator('.outline-item.focused');
    const recurrenceIndicator = focusedItem.locator('.recurrence-indicator');
    await expect(recurrenceIndicator).not.toBeVisible();
  });

  test('Clear button in picker works', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Open picker and set a frequency
    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    const recurrencePicker = page.locator('.recurrence-picker');
    await expect(recurrencePicker).toBeVisible();

    const frequencySelect = page.locator('.frequency-select');
    await frequencySelect.selectOption('daily');
    await page.waitForTimeout(100);

    // Preview should show "Daily"
    const preview = page.locator('.preview');
    await expect(preview).toContainText('Daily');

    // Click Clear to reset
    await page.locator('.btn-clear').click();
    await page.waitForTimeout(100);

    // Picker should close
    await expect(recurrencePicker).not.toBeVisible();

    // No recurrence indicator should appear
    const focusedItem = page.locator('.outline-item.focused');
    const recurrenceIndicator = focusedItem.locator('.recurrence-indicator');
    await expect(recurrenceIndicator).not.toBeVisible();
  });

  test('interval setting works', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+r');
    await page.waitForTimeout(100);

    // Select Daily
    const frequencySelect = page.locator('.frequency-select');
    await frequencySelect.selectOption('daily');
    await page.waitForTimeout(100);

    // Set interval to 3
    const intervalInput = page.locator('.interval-input');
    await intervalInput.fill('3');
    await page.waitForTimeout(100);

    // Preview should update
    const preview = page.locator('.preview');
    await expect(preview).toContainText('Every 3 days');
  });
});
