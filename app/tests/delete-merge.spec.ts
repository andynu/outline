import { test, expect } from '@playwright/test';

test.describe('Backspace key merge behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Backspace at start of item with text merges with previous item', async ({ page }) => {
    // Create two items to test merging
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create first item with content
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('First part');
    await page.waitForTimeout(200);

    // Verify first item content
    let focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('First part');

    // Create second item with content
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second part');
    await page.waitForTimeout(200);

    // Verify second item content
    focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('Second part');

    // Get item count before merge
    const countBefore = await page.locator('.outline-item').count();

    // Move cursor to beginning of "Second part"
    await page.keyboard.press('Home');
    await page.waitForTimeout(50);

    // Press Backspace to merge with previous item
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // One item should have been removed
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore - 1);

    // The focused item should contain merged content
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe('First partSecond part');
  });

  test('Backspace at start positions cursor at merge point', async ({ page }) => {
    // Create two items to test cursor positioning
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create first item with content
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('ABC');
    await page.waitForTimeout(200);

    // Create second item with content
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('DEF');
    await page.waitForTimeout(200);

    // Move cursor to beginning
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);  // Wait longer for cursor to settle

    // Press Backspace to merge
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);  // Wait longer for cursor positioning

    // Verify merged content
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe('ABCDEF');

    // Type a character - it should appear at the merge point (after ABC)
    await page.keyboard.type('X');
    await page.waitForTimeout(100);

    const newContent = await focusedEditor.textContent();
    expect(newContent).toBe('ABCXDEF');
  });

  test('Backspace at start of empty item focuses previous item at end', async ({ page }) => {
    // Create two items - first with content, second empty
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create first item with content
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Content here');
    await page.waitForTimeout(200);

    // Create an empty second item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Get item count before delete
    const countBefore = await page.locator('.outline-item').count();

    // Cursor should be at start of empty item, press Backspace
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // One item should have been removed
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore - 1);

    // Focus should be on previous item
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe('Content here');

    // Type a character - it should appear at the end
    await page.keyboard.type('!');
    await page.waitForTimeout(100);

    const newContent = await focusedEditor.textContent();
    expect(newContent).toBe('Content here!');
  });

  test('Backspace at start merges sibling children', async ({ page }) => {
    // This tests the exact scenario: two siblings under a parent
    // "This is a new area"
    //   "Getting a feel for it. So far"
    //   "So good."  <- cursor here, press Backspace
    // Expected: "Getting a feel for it. So farSo good."

    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create parent item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('This is a new area');
    await page.waitForTimeout(200);

    // Create first child
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Getting a feel for it. So far');
    await page.keyboard.press('Tab');  // Indent to make it a child
    await page.waitForTimeout(200);

    // Create second child (sibling of first)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('So good.');
    await page.waitForTimeout(200);

    // Verify structure - both should be at same level (siblings)
    let focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('So good.');

    // Get item count before merge
    const countBefore = await page.locator('.outline-item').count();

    // Move cursor to beginning of "So good."
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);

    // Press Backspace to merge with previous sibling
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    // One item should have been removed
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore - 1);

    // The focused item should contain merged content
    focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('Getting a feel for it. So farSo good.');
  });

  test('Backspace at start moves children to previous item', async ({ page }) => {
    // Create parent item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Previous item');
    await page.waitForTimeout(200);

    // Verify "Previous item" was saved
    let focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('Previous item');

    // Create sibling that will have children
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Item with children');
    await page.waitForTimeout(200);

    // Create child of that item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child item');
    await page.keyboard.press('Tab');  // Indent to make it a child
    await page.waitForTimeout(200);

    // Go back up to "Item with children"
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Verify we're on the right item
    focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('Item with children');

    // Verify the previous item still has correct content
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('Previous item');

    // Go back to "Item with children"
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);  // Wait for editor to initialize
    focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('Item with children');

    // Move cursor to beginning - need to wait for editor's auto-focus('end') to complete first
    await page.waitForTimeout(50);  // Wait for the setTimeout in editor init
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);  // Wait for Home to take effect

    // Press Backspace to merge with previous item
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // The merged item should have the combined content
    focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('Previous itemItem with children');

    // The child should now be under the merged item
    const childrenWrapper = page.locator('.outline-item.focused .children-wrapper');
    const childCount = await childrenWrapper.locator('.outline-item').count();
    expect(childCount).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Forward Delete key behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Delete on empty item focuses next item at start', async ({ page }) => {
    // Create three items - first with content, second empty, third with content
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create first item with content
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('First item');
    await page.waitForTimeout(200);

    // Create an empty second item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    // Don't type anything - leave it empty

    // Create third item with content
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Third item');
    await page.waitForTimeout(200);

    // Get item count before delete
    const countBefore = await page.locator('.outline-item').count();

    // Navigate back to the empty item
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Verify we're on empty item
    let focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('');

    // Press Delete (forward delete) to delete empty item and focus next
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // One item should have been removed
    const countAfter = await page.locator('.outline-item').count();
    expect(countAfter).toBe(countBefore - 1);

    // Focus should be on next item (Third item)
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe('Third item');

    // Type a character - it should appear at the start
    await page.keyboard.type('X');
    await page.waitForTimeout(100);

    const newContent = await focusedEditor.textContent();
    expect(newContent).toBe('XThird item');
  });
});
