import { test, expect } from '@playwright/test';

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('sidebar toggle button is visible', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-toggle');
    await expect(toggleBtn).toBeVisible();
  });

  test('clicking toggle button opens sidebar', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForTimeout(100);

    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible({ timeout: 3000 });
  });

  test('sidebar shows Documents header', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForTimeout(100);

    const header = page.locator('.sidebar-header h2');
    await expect(header).toContainText('Documents');
  });

  test('sidebar shows document list', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForTimeout(500); // Wait for documents to load

    const documentList = page.locator('.document-list');
    await expect(documentList).toBeVisible();

    // Should have at least one document
    const documentItems = page.locator('.document-item');
    const count = await documentItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('document item shows title and count', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForTimeout(500);

    // Check for document title
    const documentTitle = page.locator('.document-item .document-title').first();
    await expect(documentTitle).toBeVisible();
    const title = await documentTitle.textContent();
    expect(title?.length).toBeGreaterThan(0);

    // Check for item count
    const documentCount = page.locator('.document-item .document-count').first();
    await expect(documentCount).toBeVisible();
    const countText = await documentCount.textContent();
    expect(countText).toMatch(/\d+ items/);
  });

  test('close button closes sidebar', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForTimeout(100);

    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();

    // Click close button
    const closeBtn = page.locator('.sidebar-close-btn');
    await closeBtn.click();
    await page.waitForTimeout(100);

    await expect(sidebar).not.toBeVisible();
  });

  test('new document button is visible', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForTimeout(100);

    const newDocBtn = page.locator('.new-document-btn');
    await expect(newDocBtn).toBeVisible();
    await expect(newDocBtn).toContainText('New Document');
  });

  test('clicking toggle again closes sidebar', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-toggle');

    // Open
    await toggleBtn.click();
    await page.waitForTimeout(100);

    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();

    // Toggle again to close
    await toggleBtn.click();
    await page.waitForTimeout(100);

    await expect(sidebar).not.toBeVisible();
  });

  test('toggle button has active state when sidebar is open', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-toggle');

    // Initially not active
    await expect(toggleBtn).not.toHaveClass(/active/);

    // Open sidebar
    await toggleBtn.click();
    await page.waitForTimeout(100);

    // Should be active
    await expect(toggleBtn).toHaveClass(/active/);

    // Close sidebar
    await toggleBtn.click();
    await page.waitForTimeout(100);

    // No longer active
    await expect(toggleBtn).not.toHaveClass(/active/);
  });

  test('clicking document item switches document', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-toggle');
    await toggleBtn.click();
    await page.waitForTimeout(500);

    // Get all document items
    const documentItems = page.locator('.document-item');
    const count = await documentItems.count();

    // If there are multiple documents, click on a different one
    if (count >= 2) {
      const secondDoc = documentItems.nth(1);
      await secondDoc.click();
      await page.waitForTimeout(300);

      // The clicked document should now be active
      await expect(secondDoc).toHaveClass(/active/);
    }
  });
});
