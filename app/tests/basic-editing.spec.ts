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

  test('Enter at end of line creates item immediately after current item', async ({ page }) => {
    // Create a clean hierarchy to test position
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Clear the first item and add known content
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Item A');
    await page.waitForTimeout(100);

    // Create Item B as sibling after A
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Item B');
    await page.waitForTimeout(100);

    // Create Item C as sibling after B
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Item C');
    await page.waitForTimeout(100);

    // Now go back to Item A
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Verify we're on Item A
    const focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('Item A');

    // Press Enter at end of Item A to create new item
    await page.keyboard.press('End');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Type content for the new item
    await page.keyboard.type('New Item After A');
    await page.waitForTimeout(100);

    // Now verify the order: A, New Item After A, B, C
    // Navigate up to check what's above
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    const aboveContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(aboveContent).toBe('Item A');

    // Navigate down from A to check order
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    const firstAfterA = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(firstAfterA).toBe('New Item After A');

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    const secondAfterA = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(secondAfterA).toBe('Item B');

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    const thirdAfterA = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(thirdAfterA).toBe('Item C');
  });

  test('Enter on item with children creates sibling after item in tree order', async ({ page }) => {
    // Create a parent with children
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Clear the first item and add known content
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Parent');
    await page.waitForTimeout(100);

    // Create Child 1 (Enter + Tab)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child 1');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Create Child 2
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child 2');
    await page.waitForTimeout(100);

    // Now go back to Parent
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Verify we're on Parent
    const parentContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(parentContent).toBe('Parent');

    // Press Enter at end of Parent to create new sibling
    await page.keyboard.press('End');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Type content
    await page.keyboard.type('New Sibling');
    await page.waitForTimeout(100);

    // The new sibling is created at position after Parent in the tree
    // (i.e., as Parent's next sibling, not as a child)
    // Visually: Parent -> Child 1 -> Child 2 -> New Sibling
    // In tree terms: New Sibling is sibling of Parent, comes after Parent

    // Navigate up - should go to Child 2 (previous visible item)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);
    const aboveNew = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(aboveNew).toBe('Child 2');

    // Navigate up again - should go to Child 1
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);
    const aboveChild2 = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(aboveChild2).toBe('Child 1');

    // Navigate up again - should go to Parent
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);
    const aboveChild1 = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(aboveChild1).toBe('Parent');

    // Navigate down from Parent - goes through children then to sibling
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    expect(await page.locator('.outline-item.focused .outline-editor').textContent()).toBe('Child 1');

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    expect(await page.locator('.outline-item.focused .outline-editor').textContent()).toBe('Child 2');

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    expect(await page.locator('.outline-item.focused .outline-editor').textContent()).toBe('New Sibling');
  });
});
