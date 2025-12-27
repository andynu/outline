import { test, expect } from '@playwright/test';

test.describe('Paste markdown lists', () => {
  test.beforeEach(async ({ context, page }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('pasting a markdown bullet list creates multiple items', async ({ page }) => {
    // Focus the first item
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForTimeout(100);

    // Clear existing content
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // Prepare markdown list content
    const markdownList = `- First item
- Second item
- Third item`;

    // Copy to clipboard and paste
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, markdownList);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);

    // Verify items were created
    const allEditors = page.locator('.outline-item .editor-wrapper');
    const count = await allEditors.count();

    // Should have at least 3 items (the original + 2 new ones, or all 3 as siblings)
    expect(count).toBeGreaterThanOrEqual(3);

    // Check that one of them contains "Second item"
    const secondItem = page.locator('.outline-item .editor-wrapper:has-text("Second item")');
    await expect(secondItem).toBeVisible();
  });

  test('pasting a checkbox list creates checkbox items', async ({ page }) => {
    // Focus the first item
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForTimeout(100);

    // Clear existing content
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // Prepare markdown checkbox list
    const markdownList = `- [ ] Unchecked task
- [x] Checked task`;

    // Copy to clipboard and paste
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, markdownList);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);

    // Verify checkbox items were created
    const checkboxes = page.locator('.checkbox-btn');
    const checkboxCount = await checkboxes.count();

    // Should have at least 2 checkboxes
    expect(checkboxCount).toBeGreaterThanOrEqual(2);

    // Verify one is checked
    const checkedCheckboxes = page.locator('.checkbox-icon.checked');
    await expect(checkedCheckboxes).toHaveCount(1);
  });

  test('pasting nested markdown creates hierarchy', async ({ page }) => {
    // Focus the first item
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForTimeout(100);

    // Clear existing content
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // Prepare nested markdown list
    const markdownList = `- Parent item
  - Child item
  - Another child`;

    // Copy to clipboard and paste
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, markdownList);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);

    // Verify items were created
    const parentItem = page.locator('.outline-item .editor-wrapper:has-text("Parent item")');
    await expect(parentItem).toBeVisible();

    // Check for child item
    const childItem = page.locator('.outline-item .editor-wrapper:has-text("Child item")');
    await expect(childItem).toBeVisible();

    // Verify the child is indented (inside a children-wrapper)
    const childrenWrapper = page.locator('.children-wrapper:has-text("Child item")');
    await expect(childrenWrapper).toBeVisible();
  });

  test('pasting plain text (non-list) uses default paste behavior', async ({ page }) => {
    // Focus the first item
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForTimeout(100);

    // Clear existing content and type initial text
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Start: ');
    await page.waitForTimeout(50);

    // Prepare plain text (not a list)
    const plainText = 'Just some plain text without list markers';

    // Copy to clipboard and paste
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, plainText);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(200);

    // Verify the text was pasted inline
    const focusedEditor = page.locator('.outline-item.focused .editor-wrapper');
    await expect(focusedEditor).toContainText('Just some plain text');
  });

  test('pasting markdown preserves inline formatting', async ({ page }) => {
    // Focus the first item
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForTimeout(100);

    // Clear existing content
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // Prepare markdown with inline formatting
    const markdownList = `- Item with **bold** text
- Item with \`code\` block`;

    // Copy to clipboard and paste
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, markdownList);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);

    // Verify bold was preserved
    const boldElement = page.locator('.outline-item strong:has-text("bold")');
    await expect(boldElement).toBeVisible();

    // Verify code was preserved
    const codeElement = page.locator('.outline-item code:has-text("code")');
    await expect(codeElement).toBeVisible();
  });
});
