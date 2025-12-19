import { test, expect } from '@playwright/test';

test.describe('Inline due dates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('typing !( opens due date suggestion popup', async ({ page }) => {
    // Click on a new item or first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(50);

    // Type !( with delay to trigger handleTextInput for each character
    await page.keyboard.type('!(', { delay: 50 });
    await page.waitForTimeout(100);

    // Check that the suggestion popup appears
    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });
  });

  test('selecting a date inserts !(YYYY-MM-DD) format', async ({ page }) => {
    // Click on first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(50);

    // Type !( with delay
    await page.keyboard.type('!(', { delay: 50 });
    await page.waitForTimeout(100);

    // Check that the suggestion popup appears
    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });

    // Press Enter to select "Today"
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Check that the editor contains a due date in !(YYYY-MM-DD) format
    const editorContent = await firstEditor.textContent();
    expect(editorContent).toMatch(/!\(\d{4}-\d{2}-\d{2}\)/);
  });

  test('due dates are styled with decorations', async ({ page }) => {
    // Click on first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(50);

    // Type a due date directly
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    await page.keyboard.type(`!(${dateStr}) `);
    await page.waitForTimeout(100);

    // Check that the due date is styled
    const dueDateSpan = page.locator('.due-date');
    await expect(dueDateSpan).toBeVisible({ timeout: 3000 });

    // Check that it has a status class (today, upcoming, etc.)
    const hasStatusClass = await dueDateSpan.evaluate((el) => {
      return el.classList.contains('due-date-today') ||
             el.classList.contains('due-date-upcoming') ||
             el.classList.contains('due-date-overdue') ||
             el.classList.contains('due-date-future');
    });
    expect(hasStatusClass).toBe(true);
  });

  test('Escape closes the due date suggestion', async ({ page }) => {
    // Click on first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(50);

    // Type !( with delay
    await page.keyboard.type('!(', { delay: 50 });
    await page.waitForTimeout(100);

    // Check that the suggestion popup appears
    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });

    // Press Escape to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Check that the suggestion popup is hidden
    await expect(suggestionPopup).not.toBeVisible();
  });

  test('can type natural date in suggestion and select it', async ({ page }) => {
    // Click on first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(50);

    // Type !( with delay, then "tom" for tomorrow
    await page.keyboard.type('!(', { delay: 50 });
    await page.waitForTimeout(100);
    await page.keyboard.type('tom', { delay: 50 });
    await page.waitForTimeout(100);

    // Check that the suggestion popup appears
    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });

    // Press Enter to select
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Check that the editor contains a due date
    const editorContent = await firstEditor.textContent();
    expect(editorContent).toMatch(/!\(\d{4}-\d{2}-\d{2}\)/);
  });
});
