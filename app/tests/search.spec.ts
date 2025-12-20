import { test, expect } from '@playwright/test';

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Ctrl+F opens search modal', async ({ page }) => {
    // Press Ctrl+F to open search
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(100);

    // Check that search modal appears (uses .modal-backdrop and .modal)
    const searchModal = page.locator('.modal-backdrop .modal');
    await expect(searchModal).toBeVisible({ timeout: 3000 });
  });

  test('search input is focused when modal opens', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(100);

    const searchInput = page.locator('.search-input');
    await expect(searchInput).toBeFocused();
  });

  test('typing shows search results', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(100);

    const searchInput = page.locator('.search-input');
    await searchInput.fill('Welcome');
    await page.waitForTimeout(300);

    // Should show results (uses .result class)
    const searchResults = page.locator('.result');
    await expect(searchResults.first()).toBeVisible({ timeout: 3000 });
  });

  test('results show content snippets', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(100);

    const searchInput = page.locator('.search-input');
    await searchInput.fill('Outline');
    await page.waitForTimeout(300);

    // Check that result content is shown
    const resultContent = page.locator('.result-content');
    await expect(resultContent.first()).toBeVisible({ timeout: 3000 });
    const text = await resultContent.first().textContent();
    expect(text?.toLowerCase()).toContain('outline');
  });

  test('clicking result navigates to item', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(100);

    const searchInput = page.locator('.search-input');
    await searchInput.fill('Features');
    await page.waitForTimeout(300);

    // Click on first result
    const firstResult = page.locator('.result').first();
    await expect(firstResult).toBeVisible({ timeout: 3000 });
    await firstResult.click();
    await page.waitForTimeout(100);

    // Modal should close
    const searchModal = page.locator('.modal-backdrop');
    await expect(searchModal).not.toBeVisible();

    // The clicked item should be focused
    const focusedItem = page.locator('.outline-item.focused');
    const focusedText = await focusedItem.locator('.editor-wrapper').first().textContent();
    expect(focusedText?.toLowerCase()).toContain('features');
  });

  test('Escape closes search modal', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(100);

    const searchModal = page.locator('.modal-backdrop .modal');
    await expect(searchModal).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    await expect(searchModal).not.toBeVisible();
  });

  test('arrow keys navigate search results', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(100);

    const searchInput = page.locator('.search-input');
    await searchInput.fill('e');
    await page.waitForTimeout(300);

    // Wait for results
    const searchResults = page.locator('.result');
    const count = await searchResults.count();

    if (count >= 2) {
      // First result should be selected
      await expect(searchResults.first()).toHaveClass(/selected/);

      // Press down arrow
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);

      // Second result should be selected
      await expect(searchResults.nth(1)).toHaveClass(/selected/);

      // Press up arrow
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);

      // First result should be selected again
      await expect(searchResults.first()).toHaveClass(/selected/);
    }
  });

  test('Enter selects current result', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(100);

    const searchInput = page.locator('.search-input');
    await searchInput.fill('Getting');
    await page.waitForTimeout(300);

    const searchResults = page.locator('.result');
    await expect(searchResults.first()).toBeVisible({ timeout: 3000 });

    // Press Enter to select
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Modal should close
    const searchModal = page.locator('.modal-backdrop');
    await expect(searchModal).not.toBeVisible();

    // Item should be focused
    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem).toBeVisible();
  });

  test('clicking backdrop closes modal', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(100);

    const searchModal = page.locator('.modal-backdrop .modal');
    await expect(searchModal).toBeVisible();

    // Click on the backdrop (outside the modal content)
    const backdrop = page.locator('.modal-backdrop');
    await backdrop.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);

    await expect(searchModal).not.toBeVisible();
  });

  test('no results message when nothing found', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(100);

    const searchInput = page.locator('.search-input');
    await searchInput.fill('zzzzxxxxxnonexistent');
    await page.waitForTimeout(300);

    // Should show no results message
    const noResults = page.locator('.no-results');
    await expect(noResults).toBeVisible({ timeout: 3000 });
  });
});
