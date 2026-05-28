import { test, expect } from '@playwright/test';

// otl-fspy: Arrow Up/Down should only cross to the previous/next item when the
// caret is on the first/last visual line of the current item. A wrapped,
// multi-line item must be navigable internally with the arrow keys.
//
// Single-line items are unaffected: their only line is both first and last, so
// the caret is always at the edge and arrows cross as before. The distinguishing
// case requires a multi-line (wrapped) item; we force wrapping with a long string.
test.describe('Arrow navigation respects the caret line (otl-fspy)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('ArrowUp from the last line of a wrapped item moves within it, not to the previous item', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create an item whose text wraps onto many visual lines.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const longText = 'lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(12).trim();
    await page.keyboard.insertText(longText);
    await page.waitForTimeout(200);

    // After typing, the caret sits on the LAST visual line of this item.
    const focused = page.locator('.outline-item.focused .outline-editor');
    expect(await focused.textContent()).toBe(longText);

    // ArrowUp should move the caret up WITHIN the wrapped item — focus must not
    // jump to the previous item. (Old behavior: jumps to the previous item.)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    expect(await focused.textContent()).toBe(longText);
  });
});
