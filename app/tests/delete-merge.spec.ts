import { test, expect } from '@playwright/test';

test.describe('Delete key merge behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Delete at end of item merges with next sibling', async ({ page }) => {
    // Click on first editor to focus it
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Type content for first item
    await page.keyboard.type('First part ');
    await page.waitForTimeout(100);

    // Press Enter to create new sibling
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Type content for second item
    await page.keyboard.type('second part');
    await page.waitForTimeout(100);

    // Get initial item count
    const initialCount = await page.locator('.outline-item').count();

    // Go back to first item
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Move to end of first item
    await page.keyboard.press('End');
    await page.waitForTimeout(50);

    // Press Delete to merge with next sibling
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Check that an item was removed
    const newCount = await page.locator('.outline-item').count();
    expect(newCount).toBe(initialCount - 1);

    // The first item should now contain both parts
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe('First part second part');
  });

  test('Delete on empty item deletes it', async ({ page }) => {
    // Click on first editor to focus it
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Press Enter to create a new empty sibling
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Get initial item count
    const initialCount = await page.locator('.outline-item').count();

    // The focused item should be empty - verify
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe('');

    // Press Delete on empty item
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Check that an item was removed
    const newCount = await page.locator('.outline-item').count();
    expect(newCount).toBe(initialCount - 1);
  });

  test('Delete at end with no next sibling does nothing', async ({ page }) => {
    // Click on first editor to focus it
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Type some content
    await page.keyboard.type('Only item');
    await page.waitForTimeout(100);

    // Move to end
    await page.keyboard.press('End');
    await page.waitForTimeout(50);

    // Get initial count
    const initialCount = await page.locator('.outline-item').count();
    const initialContent = await page.locator('.outline-item.focused .outline-editor').textContent();

    // Press Delete at end (nothing should happen)
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    // Count and content should be unchanged
    const newCount = await page.locator('.outline-item').count();
    const newContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(newCount).toBe(initialCount);
    expect(newContent).toBe(initialContent);
  });

  test('Delete in middle of content deletes character normally', async ({ page }) => {
    // Click on first editor to focus it
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Type some content
    await page.keyboard.type('Hello World');
    await page.waitForTimeout(100);

    // Move to beginning then right 5 characters to position before 'W'
    await page.keyboard.press('Home');
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(50);

    // Press Delete to remove 'W'
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    // Content should now be 'Hello orld'
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const content = await focusedEditor.textContent();
    expect(content).toBe('Hello orld');
  });

  test('Delete merge moves children from next sibling', async ({ page }) => {
    // Create structure: First > (child1) then Second
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Type first item
    await page.keyboard.type('First');
    await page.waitForTimeout(100);

    // Create sibling
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Type second item
    await page.keyboard.type('Second');
    await page.waitForTimeout(100);

    // Create a child under Second (Tab to indent)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.type('Child of Second');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    // Get count
    const initialCount = await page.locator('.outline-item').count();
    expect(initialCount).toBe(4); // First, Second, Child of Second, plus original

    // Go to First item
    // Navigate: up to Second, up to First
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Verify we're on First
    let focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('First');

    // Move to end of First
    await page.keyboard.press('End');
    await page.waitForTimeout(50);

    // Delete to merge with Second
    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);

    // Count should be reduced by 1 (Second is merged)
    const newCount = await page.locator('.outline-item').count();
    expect(newCount).toBe(initialCount - 1);

    // First should now contain "FirstSecond"
    focusedContent = await page.locator('.outline-item.focused .outline-editor').textContent();
    expect(focusedContent).toBe('FirstSecond');
  });
});
