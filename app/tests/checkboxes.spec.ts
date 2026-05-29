import { test, expect, type Locator, type Page } from '@playwright/test';

// Class-token matcher: avoids substring collisions (e.g. a future "unchecked").
const CHECKED = /(^|\s)checked(\s|$)/;

// Click the focused item's contenteditable to give it real DOM focus.
// Clicking an item / .editor-wrapper sets React focus (the .focused class), but
// the editor only receives DOM focus on a setTimeout(0) tick (useOutlineEditor).
// Editor shortcuts (Ctrl+Enter to toggle completion, Ctrl+Shift+X to convert,
// the [ ]/[x] input rules) are handled in the editor's ProseMirror keydown, so
// they are dropped under load if the editor lacks DOM focus. Clicking the editor
// focuses it synchronously. Only the focused item renders .outline-editor
// (descendants are static), so the selector is unique. Mirrors notes.spec.ts.
async function focusCurrentEditor(page: Page): Promise<Locator> {
  const focused = page.locator('.outline-item.focused');
  await expect(focused).toHaveCount(1);
  await focused.locator('.outline-editor').click();
  return focused;
}

// Focus a specific item, then give its editor DOM focus.
async function focusItemEditor(page: Page, item: Locator): Promise<Locator> {
  await item.click();
  return focusCurrentEditor(page);
}

// Create a fresh checkbox item below the first real item and return it focused
// with its editor DOM-focused. After Enter creates a sibling, a NEW editor
// mounts (again on a setTimeout(0) tick), so re-focus it before each shortcut.
async function newCheckboxItem(page: Page, text: string): Promise<Locator> {
  const firstEditor = page.locator('.editor-wrapper').first();
  await focusItemEditor(page, firstEditor);

  await page.keyboard.press('Enter');
  await focusCurrentEditor(page);

  await page.keyboard.type(text);

  // Convert to checkbox via the editor shortcut.
  await focusCurrentEditor(page);
  await page.keyboard.press('Control+Shift+x');

  const focusedItem = page.locator('.outline-item.focused');
  await expect(focusedItem.locator('.checkbox-btn')).toBeVisible();
  return focusedItem;
}

test.describe('Checkboxes and completion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Ctrl+Shift+X converts bullet to checkbox', async ({ page }) => {
    // Create a new item
    const firstEditor = page.locator('.editor-wrapper').first();
    await focusItemEditor(page, firstEditor);

    await page.keyboard.press('Enter');
    await focusCurrentEditor(page);

    // Type some text
    await page.keyboard.type('My task');

    // It should be a bullet by default
    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem.locator('.bullet')).toBeVisible();

    // Press Ctrl+Shift+X to convert to checkbox
    await focusCurrentEditor(page);
    await page.keyboard.press('Control+Shift+x');

    // Should now have a checkbox, not a bullet
    await expect(focusedItem.locator('.checkbox-btn')).toBeVisible();
    await expect(focusedItem.locator('.bullet')).not.toBeVisible();
  });

  test('Ctrl+Shift+X converts checkbox back to bullet', async ({ page }) => {
    // Create a new item and convert to checkbox
    const focusedItem = await newCheckboxItem(page, 'My task');
    await expect(focusedItem.locator('.checkbox-btn')).toBeVisible();

    // Convert back to bullet
    await focusCurrentEditor(page);
    await page.keyboard.press('Control+Shift+x');

    // Should now have bullet again
    await expect(focusedItem.locator('.bullet')).toBeVisible();
    await expect(focusedItem.locator('.checkbox-btn')).not.toBeVisible();
  });

  test('Ctrl+Enter toggles completion', async ({ page }) => {
    // Create a new item and make it a checkbox
    await newCheckboxItem(page, 'Task to complete');
    // Track the item by text: Ctrl+Enter advances focus to the next node
    // (useOutlineEditor.ts), so the checkbox is no longer .focused afterward.
    // The `checked` class lives on .outline-item in both focused and static
    // renders, so a by-text locator works regardless of focus. Scope to the
    // item whose OWN row carries the text: Enter on the parent creates a CHILD,
    // and an .outline-item's text includes its descendants, so a bare hasText
    // also matches the ancestor ("Getting Started"). Children live under
    // `> .children-wrapper`, never `> .item-row`, so own-row scoping is unique.
    const item = page
      .locator('.outline-item')
      .filter({ has: page.locator('> .item-row', { hasText: 'Task to complete' }) });
    const checkboxIcon = item.locator('.checkbox-icon').first();

    // Initially unchecked
    await expect(checkboxIcon).not.toHaveClass(CHECKED);
    await expect(item).not.toHaveClass(CHECKED);

    // Press Ctrl+Enter to complete (editor must be DOM-focused for the shortcut)
    await focusCurrentEditor(page);
    await page.keyboard.press('Control+Enter');

    // Should now be checked (item is now unfocused/static — assertions auto-retry)
    await expect(item).toHaveClass(CHECKED);
    await expect(checkboxIcon).toHaveClass(CHECKED);
  });

  test('Ctrl+Enter toggles completion off', async ({ page }) => {
    // Create, convert, and complete an item
    await newCheckboxItem(page, 'Task');
    // Track by own-row text: each Ctrl+Enter advances focus off the checkbox,
    // and a bare hasText would also match the ancestor "Getting Started" (the
    // item is created as its child). `> .item-row` excludes descendants.
    const item = page
      .locator('.outline-item')
      .filter({ has: page.locator('> .item-row', { hasText: 'Task' }) });

    // Complete it
    await focusCurrentEditor(page);
    await page.keyboard.press('Control+Enter');
    await expect(item).toHaveClass(CHECKED);

    // Focus moved to the next node after the first toggle — re-focus the
    // checkbox item (and DOM-focus its editor) before toggling off.
    await item.click();
    await page.locator('.outline-item.focused .outline-editor').click();
    await page.keyboard.press('Control+Enter');
    await expect(item).not.toHaveClass(CHECKED);
  });

  test('typing [ ] converts to checkbox', async ({ page }) => {
    // Create a new item
    const firstEditor = page.locator('.editor-wrapper').first();
    await focusItemEditor(page, firstEditor);

    await page.keyboard.press('Enter');
    await focusCurrentEditor(page);

    // Type [ ] followed by space
    await page.keyboard.type('[ ] ', { delay: 50 });

    const focusedItem = page.locator('.outline-item.focused');
    // Should be converted to checkbox
    await expect(focusedItem.locator('.checkbox-btn')).toBeVisible();
    // And should be unchecked
    await expect(focusedItem.locator('.checkbox-icon')).not.toHaveClass(CHECKED);
  });

  test('typing [x] converts to checked checkbox', async ({ page }) => {
    // Create a new item
    const firstEditor = page.locator('.editor-wrapper').first();
    await focusItemEditor(page, firstEditor);

    await page.keyboard.press('Enter');
    await focusCurrentEditor(page);

    // Type [x] followed by space
    await page.keyboard.type('[x] ', { delay: 50 });

    const focusedItem = page.locator('.outline-item.focused');
    // Should be converted to checkbox
    await expect(focusedItem.locator('.checkbox-btn')).toBeVisible();
    // And should be checked
    await expect(focusedItem.locator('.checkbox-icon')).toHaveClass(CHECKED);
  });

  test('completed items show strikethrough', async ({ page }) => {
    // Create and complete an item
    await newCheckboxItem(page, 'Completed task');
    // Track by own-row text: Ctrl+Enter advances focus off the checkbox, so it
    // renders statically afterward (.static-content, not .outline-editor). A
    // bare hasText would also match the ancestor "Getting Started" (the item is
    // created as its child); `> .item-row` excludes descendants.
    const item = page
      .locator('.outline-item')
      .filter({ has: page.locator('> .item-row', { hasText: 'Completed task' }) });

    await focusCurrentEditor(page);
    await page.keyboard.press('Control+Enter');

    // Check that the item has the checked class which applies strikethrough
    await expect(item).toHaveClass(CHECKED);

    // The static content should have strikethrough via CSS
    // (.outline-item.checked .static-content). Poll: the CSS recompute is async.
    const content = item.locator('.static-content').first();
    await expect
      .poll(async () =>
        content.evaluate((el) => window.getComputedStyle(el).textDecoration)
      )
      .toContain('line-through');
  });

  test('clicking checkbox toggles completion', async ({ page }) => {
    // Create a checkbox item
    const focusedItem = await newCheckboxItem(page, 'Click test');
    const checkboxBtn = focusedItem.locator('.checkbox-btn');

    // Click to check
    await checkboxBtn.click();
    await expect(focusedItem).toHaveClass(CHECKED);

    // Click again to uncheck
    await checkboxBtn.click();
    await expect(focusedItem).not.toHaveClass(CHECKED);
  });

  test('checkbox shows check mark when completed', async ({ page }) => {
    // Create a checkbox item
    await newCheckboxItem(page, 'Visual test');
    // Track by text: Ctrl+Enter advances focus off the checkbox. The checkmark
    // renders in .checkbox-icon in both the focused and static renders, so a
    // by-text locator works regardless of which render is active.
    const item = page
      .locator('.outline-item')
      .filter({ hasText: 'Visual test' })
      .first();
    const checkboxIcon = item.locator('.checkbox-icon').first();

    // Initially no checkmark
    await expect(checkboxIcon).toHaveText('');

    // Complete it (editor must be DOM-focused for the shortcut)
    await focusCurrentEditor(page);
    await page.keyboard.press('Control+Enter');

    // Should show checkmark (item is now unfocused/static — assertion auto-retries)
    await expect(checkboxIcon).toHaveText('✓');
  });
});
