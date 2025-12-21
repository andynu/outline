import { test, expect } from '@playwright/test';

test.describe('Rename document', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await page.waitForSelector('.outline-item');
  });

  test('right-click on document shows context menu with Rename option', async ({ page }) => {
    // Open sidebar
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForSelector('.sidebar');

    // Right-click on document item
    const docItem = page.locator('.document-item').first();
    await docItem.click({ button: 'right' });

    // Context menu should appear with Rename option
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();

    const renameBtn = contextMenu.locator('.context-menu-item');
    await expect(renameBtn).toContainText('Rename');
  });

  test('clicking Rename opens rename modal', async ({ page }) => {
    // Open sidebar
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForSelector('.sidebar');

    // Right-click on document item
    const docItem = page.locator('.document-item').first();
    await docItem.click({ button: 'right' });

    // Click Rename
    const renameBtn = page.locator('.context-menu .context-menu-item');
    await renameBtn.click();

    // Modal should appear
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    // Modal should have correct title
    await expect(modal.locator('h3')).toContainText('Rename Document');

    // Input should be focused and contain current title
    const input = modal.locator('.rename-input');
    await expect(input).toBeFocused();
  });

  test('double-click on document opens rename modal', async ({ page }) => {
    // Open sidebar
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForSelector('.sidebar');

    // Double-click on document item
    const docItem = page.locator('.document-item').first();
    await docItem.dblclick();

    // Modal should appear
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();
  });

  test('pressing Escape closes rename modal', async ({ page }) => {
    // Open sidebar
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForSelector('.sidebar');

    // Double-click to open rename modal
    const docItem = page.locator('.document-item').first();
    await docItem.dblclick();

    // Modal should be visible
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    // Wait for modal animation and focus setup
    await page.waitForTimeout(100);

    // Press Escape
    const input = modal.locator('.rename-input');
    await input.press('Escape');

    // Modal should close
    await expect(modal).not.toBeVisible();
  });

  test('clicking Cancel closes rename modal', async ({ page }) => {
    // Open sidebar
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForSelector('.sidebar');

    // Double-click to open rename modal
    const docItem = page.locator('.document-item').first();
    await docItem.dblclick();

    // Modal should be visible
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    // Click Cancel
    await modal.locator('.btn-cancel').click();

    // Modal should close
    await expect(modal).not.toBeVisible();
  });
});
