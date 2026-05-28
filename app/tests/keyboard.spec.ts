import { test, expect } from '@playwright/test';

// Indentation is nested .children-wrapper containers, not a margin-left on
// .outline-item; measure depth = number of .children-wrapper ancestors.
function focusedDepth(page: import('@playwright/test').Page): Promise<number> {
  return page.locator('.outline-item.focused').first().evaluate((el) => {
    let d = 0;
    let p: HTMLElement | null = el.parentElement;
    while (p) { if (p.classList && p.classList.contains('children-wrapper')) d++; p = p.parentElement; }
    return d;
  });
}

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Tab indents the current item', async ({ page }) => {
    // "Press Tab to indent" has a previous sibling, so it can be indented.
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Press Tab to indent$/ });
    await editor.click();
    await expect(page.locator('.outline-item.focused')).toHaveCount(1);

    const before = await focusedDepth(page);
    await page.keyboard.press('Tab');
    await expect.poll(() => focusedDepth(page)).toBe(before + 1);
  });

  test('Shift+Tab outdents the current item', async ({ page }) => {
    // "Press Shift+Tab to outdent" is a child (depth >= 1), so it can be outdented.
    const editor = page.locator('.editor-wrapper').filter({ hasText: /^Press Shift\+Tab to outdent$/ });
    await editor.click();
    await expect(page.locator('.outline-item.focused')).toHaveCount(1);

    const before = await focusedDepth(page);
    expect(before).toBeGreaterThan(0);
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => focusedDepth(page)).toBe(before - 1);
  });

  test('Enter creates a new sibling item', async ({ page }) => {
    // Count initial items
    const initialCount = await page.locator('.outline-item').count();

    // Click on first root item to focus it
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100); // Wait for editor to initialize

    // Press Enter to create new sibling
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Check that a new item was created
    const newCount = await page.locator('.outline-item').count();
    expect(newCount).toBe(initialCount + 1);
  });

  test('Arrow keys navigate between items', async ({ page }) => {
    // Click on first item to focus it
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100); // Wait for editor to initialize

    // Get the focused item's text (use editor-wrapper which works for both static and focused)
    const focusedBefore = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();

    // Press Down to move to next item
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100); // Wait for editor to initialize on new item

    // Check that focus moved to a different item
    const focusedAfter = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();
    expect(focusedAfter).not.toBe(focusedBefore);
  });
});
