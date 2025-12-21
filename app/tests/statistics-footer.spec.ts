import { test, expect } from '@playwright/test';

test.describe('Statistics footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('status bar shows word count', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toContainText('words');
  });

  test('status bar shows items in content count', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toContainText('in items');
  });

  test('status bar shows notes word count', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toContainText('in notes');
  });

  test('status bar shows item count', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toContainText('items');
  });

  test('statistics have tooltips', async ({ page }) => {
    // Check that stat items have title attributes
    const totalWordsItem = page.locator('.stat-item[title*="Total words"]');
    await expect(totalWordsItem).toBeVisible();

    const contentWordsItem = page.locator('.stat-item[title*="Words in item content"]');
    await expect(contentWordsItem).toBeVisible();

    const noteWordsItem = page.locator('.stat-item[title*="Words in notes"]');
    await expect(noteWordsItem).toBeVisible();

    const itemCountItem = page.locator('.stat-item[title*="Total items"]');
    await expect(itemCountItem).toBeVisible();
  });

  test('word count updates when typing', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    const totalWordsItem = page.locator('.stat-item[title*="Total words"]');

    // Get initial word count
    const initialText = await totalWordsItem.textContent();
    const initialWords = parseInt(initialText?.match(/\d+/)?.[0] || '0');

    // Focus an item and type some words
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Add some words
    await page.keyboard.type(' extra words here');
    await page.waitForTimeout(300);

    // Get new word count
    const newText = await totalWordsItem.textContent();
    const newWords = parseInt(newText?.match(/\d+/)?.[0] || '0');

    // Word count should have increased
    expect(newWords).toBeGreaterThan(initialWords);
  });

  test('item count updates when adding items', async ({ page }) => {
    const itemCountItem = page.locator('.stat-item[title*="Total items"]');

    // Get initial item count
    const initialText = await itemCountItem.textContent();
    const initialCount = parseInt(initialText?.match(/\d+/)?.[0] || '0');

    // Add a new item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Get new item count
    const newText = await itemCountItem.textContent();
    const newCount = parseInt(newText?.match(/\d+/)?.[0] || '0');

    // Item count should have increased by 1
    expect(newCount).toBe(initialCount + 1);
  });

  test('note words update when adding note', async ({ page }) => {
    const noteWordsItem = page.locator('.stat-item[title*="Words in notes"]');

    // Get initial note word count (should be 0 initially)
    const initialText = await noteWordsItem.textContent();
    const initialNoteWords = parseInt(initialText?.match(/\d+/)?.[0] || '0');

    // Focus an item and add a note
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Press Shift+Enter to add a note
    await page.keyboard.press('Shift+Enter');
    await page.waitForTimeout(100);

    // Type in the note
    const noteInput = page.locator('.note-input');
    await noteInput.fill('This is a test note with words');
    await page.waitForTimeout(300);

    // Get new note word count
    const newText = await noteWordsItem.textContent();
    const newNoteWords = parseInt(newText?.match(/\d+/)?.[0] || '0');

    // Note word count should have increased
    expect(newNoteWords).toBeGreaterThan(initialNoteWords);
  });

  test('separators are visible between stats', async ({ page }) => {
    const separators = page.locator('.stat-separator');
    await expect(separators).toHaveCount(3); // 3 separators between 4 stats
  });
});
