import { test, expect } from '@playwright/test';

test.describe('Basic editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Enter creates new sibling item', async ({ page }) => {
    // Count initial items
    const initialCount = await page.locator('.outline-item').count();

    // Click on first editor to focus it
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Enter to create new sibling
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Check that a new item was created
    const newCount = await page.locator('.outline-item').count();
    expect(newCount).toBe(initialCount + 1);
  });

  test('Backspace on empty item deletes it', async ({ page }) => {
    // First, create a new item to have a clean slate
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Enter to create a new empty item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Count items after creation
    const countAfterCreate = await page.locator('.outline-item').count();

    // The new item should be focused and empty
    // Press Backspace to delete it
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    // Check that the item was deleted
    const countAfterDelete = await page.locator('.outline-item').count();
    expect(countAfterDelete).toBe(countAfterCreate - 1);
  });

  test('Ctrl+Shift+Backspace deletes current item', async ({ page }) => {
    // First, create a new item with content
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Enter to create a new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type some content so it's not empty
    await page.keyboard.type('Item to delete');
    await page.waitForTimeout(100);

    // Count items after creation
    const countAfterCreate = await page.locator('.outline-item').count();

    // Press Ctrl+Shift+Backspace to delete
    await page.keyboard.press('Control+Shift+Backspace');
    await page.waitForTimeout(100);

    // Check that the item was deleted
    const countAfterDelete = await page.locator('.outline-item').count();
    expect(countAfterDelete).toBe(countAfterCreate - 1);
  });

  test('typing in editor updates content', async ({ page }) => {
    // Create a new item first
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Enter to create a new empty item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type some content
    const testText = 'Hello World Test';
    await page.keyboard.type(testText);
    await page.waitForTimeout(100);

    // Find the focused item and check its content
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe(testText);
  });

  test('clicking item focuses it', async ({ page }) => {
    // Get the second editor (not first to verify focus change)
    const editors = page.locator('.editor-wrapper');
    const count = await editors.count();
    expect(count).toBeGreaterThan(1);

    // Get the second editor
    const secondEditor = editors.nth(1);
    const secondItemText = await secondEditor.textContent();

    // Click on the second item
    await secondEditor.click();
    await page.waitForTimeout(100);

    // Check that it now has the focused class
    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem).toBeVisible();

    // Verify the focused item contains the text we clicked on
    const focusedText = await focusedItem.locator('.editor-wrapper').first().textContent();
    expect(focusedText).toBe(secondItemText);
  });

  test('clicking different items changes focus', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');
    const count = await editors.count();
    expect(count).toBeGreaterThan(2);

    // Click first item
    await editors.first().click();
    await page.waitForTimeout(100);

    const firstFocusedText = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();

    // Click third item
    await editors.nth(2).click();
    await page.waitForTimeout(100);

    const secondFocusedText = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();

    // Verify focus changed to a different item
    expect(secondFocusedText).not.toBe(firstFocusedText);
  });
});
