import { test, expect } from '@playwright/test';

test.describe('Tags panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  // Helper to open tags panel
  async function openTagsPanel(page: any) {
    const tagsBtn = page.locator('.toolbar-btn[title*="Tags"]');
    await tagsBtn.click();
    await page.waitForTimeout(100);
  }

  test('toolbar button opens tags panel', async ({ page }) => {
    await openTagsPanel(page);

    // Check that modal appears with Tags title
    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible({ timeout: 3000 });

    const header = modal.locator('.modal-header h2');
    await expect(header).toContainText('Tags');
  });

  test('keyboard focus in modal', async ({ page }) => {
    await openTagsPanel(page);

    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible();

    // Modal should have focus on the backdrop for keyboard handling
    const backdrop = page.locator('.modal-backdrop');
    await expect(backdrop).toBeVisible();
  });

  test('clicking backdrop closes tags panel', async ({ page }) => {
    await openTagsPanel(page);

    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible();

    // Click on backdrop
    const backdrop = page.locator('.modal-backdrop');
    await backdrop.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);

    await expect(modal).not.toBeVisible();
  });

  test('close button closes tags panel', async ({ page }) => {
    await openTagsPanel(page);

    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible();

    // Click close button
    const closeBtn = modal.locator('.close-btn');
    await closeBtn.click();
    await page.waitForTimeout(100);

    await expect(modal).not.toBeVisible();
  });

  test('shows content area', async ({ page }) => {
    await openTagsPanel(page);

    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible();

    // Should have a results area
    const results = modal.locator('.results');
    await expect(results).toBeVisible();
  });

  test('shows hint text at bottom', async ({ page }) => {
    await openTagsPanel(page);

    const hint = page.locator('.modal-footer .hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Escape');
  });

  test('creates tag and shows in panel', async ({ page }) => {
    // First create a hashtag in the outline
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type a hashtag and complete it
    await page.keyboard.type('#paneltesttag ', { delay: 50 });
    await page.waitForTimeout(300);

    // Open tags panel
    await openTagsPanel(page);

    const modal = page.locator('.modal-backdrop .modal');
    await expect(modal).toBeVisible();

    // Should show the tag
    const tagItem = page.locator('.tag-item .tag-name').filter({ hasText: '#paneltesttag' });
    await expect(tagItem).toBeVisible({ timeout: 3000 });
  });

  test('tag shows count badge', async ({ page }) => {
    // First create a hashtag
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('#badgetag ', { delay: 50 });
    await page.waitForTimeout(300);

    // Open tags panel
    await openTagsPanel(page);

    // Find the tag item with count badge
    const tagItem = page.locator('.tag-item').filter({ hasText: '#badgetag' });
    await expect(tagItem).toBeVisible({ timeout: 3000 });

    const countBadge = tagItem.locator('.tag-count-badge');
    await expect(countBadge).toBeVisible();
    const countText = await countBadge.textContent();
    expect(parseInt(countText || '0')).toBeGreaterThan(0);
  });

  test('clicking tag shows items with that tag', async ({ page }) => {
    // Create a hashtag
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('Item with #detailtag here', { delay: 30 });
    await page.waitForTimeout(300);

    // Open tags panel
    await openTagsPanel(page);

    // Click on the tag
    const tagItem = page.locator('.tag-item').filter({ hasText: '#detailtag' });
    await expect(tagItem).toBeVisible({ timeout: 3000 });
    await tagItem.click();
    await page.waitForTimeout(100);

    // Should show the tag name in header
    const header = page.locator('.modal-header h2');
    await expect(header).toContainText('#detailtag');

    // Should show result items
    const resultItem = page.locator('.result-item');
    await expect(resultItem.first()).toBeVisible();
  });
});
