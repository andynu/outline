import { test, expect } from '@playwright/test';

test.describe('Settings panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('Ctrl+, opens settings modal', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    // Check the title
    const title = page.locator('#settings-title');
    await expect(title).toHaveText('Settings');
  });

  test('settings button in toolbar opens settings modal', async ({ page }) => {
    const settingsBtn = page.locator('.toolbar-btn.settings-btn');
    await expect(settingsBtn).toBeVisible();

    await settingsBtn.click();
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();
  });

  test('Help menu contains Settings option', async ({ page }) => {
    // Open Help menu
    const helpMenu = page.locator('button:has-text("Help")').first();
    await helpMenu.click();
    await page.waitForTimeout(100);

    // Look for Settings option
    const settingsOption = page.locator('.menu-item-btn:has-text("Settings")');
    await expect(settingsOption).toBeVisible();
  });

  test('Escape closes settings modal', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    await expect(modal).not.toBeVisible();
  });

  test('Close button closes settings modal', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    const closeBtn = modal.locator('.close-btn');
    await closeBtn.click();
    await page.waitForTimeout(100);

    await expect(modal).not.toBeVisible();
  });

  test('clicking backdrop closes settings modal', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    // Click on the backdrop (outside the modal)
    await page.locator('.modal-backdrop').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);

    await expect(modal).not.toBeVisible();
  });

  test('theme dropdown is visible and works', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    // Check theme dropdown exists
    const themeSelect = modal.locator('#theme-select');
    await expect(themeSelect).toBeVisible();

    // Check theme options exist
    const options = themeSelect.locator('option');
    await expect(options).toHaveCount(5); // system, light, dark, gruvbox-light, gruvbox-dark

    // Select dark theme
    await themeSelect.selectOption('dark');
    await page.waitForTimeout(100);

    // Verify dark mode is applied
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Select light theme
    await themeSelect.selectOption('light');
    await page.waitForTimeout(100);

    // Verify light mode is applied (light theme removes data-theme attribute)
    await expect(html).not.toHaveAttribute('data-theme');
  });

  test('font size dropdown is visible', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    const fontSizeSelect = modal.locator('#font-size');
    await expect(fontSizeSelect).toBeVisible();

    // Check some font size options exist
    const options = fontSizeSelect.locator('option');
    await expect(options).toHaveCount(7); // 12, 13, 14, 15, 16, 18, 20
  });

  test('font family dropdown is visible', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    const fontFamilySelect = modal.locator('#font-family');
    await expect(fontFamilySelect).toBeVisible();

    // Check some font options exist
    const options = fontFamilySelect.locator('option');
    await expect(options).toHaveCount(6); // system, inter, roboto, source-sans, jetbrains-mono, fira-code
  });

  test('auto-save dropdown is visible', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    const autoSaveSelect = modal.locator('#auto-save');
    await expect(autoSaveSelect).toBeVisible();
  });

  test('confirm delete toggle is visible', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    const confirmDeleteToggle = modal.locator('.setting-toggle:has-text("Confirm before deleting")');
    await expect(confirmDeleteToggle).toBeVisible();
  });

  test('start collapsed toggle is visible', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    const startCollapsedToggle = modal.locator('.setting-toggle:has-text("Start collapsed")');
    await expect(startCollapsedToggle).toBeVisible();
  });

  test('data directory is displayed', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    const dataPath = modal.locator('.data-dir-path');
    await expect(dataPath).toBeVisible();
    await expect(dataPath).toContainText('.outline-data');
  });

  test('browse button is visible for data directory', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    // Use more specific locator - the Browse button with 'Browse...' text (not Import Now)
    const browseBtn = modal.locator('.btn-browse:has-text("Browse...")');
    await expect(browseBtn).toBeVisible();
    await expect(browseBtn).toHaveText('Browse...');
  });

  test('reset to defaults button is visible', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    const resetBtn = modal.locator('.btn-reset');
    await expect(resetBtn).toBeVisible();
    await expect(resetBtn).toHaveText('Reset to Defaults');
  });

  test('settings persist across modal close/reopen', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    // Change font size
    const fontSizeSelect = modal.locator('#font-size');
    await fontSizeSelect.selectOption('18');
    await page.waitForTimeout(100);

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Reopen modal
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    // Verify font size is still 18
    const newModal = page.locator('.modal[aria-labelledby="settings-title"]');
    const newFontSizeSelect = newModal.locator('#font-size');
    await expect(newFontSizeSelect).toHaveValue('18');
  });

  test('keyboard shortcuts section links to shortcuts modal', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(100);

    const modal = page.locator('.modal[aria-labelledby="settings-title"]');
    await expect(modal).toBeVisible();

    // Check that keyboard shortcuts section exists
    const shortcutsSection = modal.locator('h3:has-text("Keyboard Shortcuts")');
    await expect(shortcutsSection).toBeVisible();

    // Check hint text
    const hint = modal.locator('.section-hint:has-text("Ctrl+/")');
    await expect(hint).toBeVisible();
  });
});
