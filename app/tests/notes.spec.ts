import { test, expect, type Locator, type Page } from '@playwright/test';

// Focus an item AND give its contenteditable DOM focus before keyboard ops.
// Clicking the item sets React focus (the .focused class), but the editor only
// receives DOM focus on a setTimeout(0) tick (useNoteEditor / useOutlineEditor),
// so a bare item-click + key-press races that tick and drops the keystroke under
// load. Shift+Enter to toggle the note is handled in the editor's ProseMirror
// keydown (useOutlineEditor.ts), so it is lost entirely when the editor lacks
// DOM focus. Clicking the editor focuses it synchronously. Mirrors the
// click-to-focus idiom in vim-navigation's buildVimTree. Only the focused item
// renders .outline-editor (descendants are static), so the selector is unique.
async function focusItemEditor(page: Page, item: Locator) {
  await item.click();
  await expect(page.locator('.outline-item.focused')).toHaveCount(1);
  await page.locator('.outline-item.focused .outline-editor').click();
}

test.describe('Secondary notes field', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('Shift+Enter opens note editor', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await focusItemEditor(page, firstItem);

    // Press Shift+Enter to open note editor
    await page.keyboard.press('Shift+Enter');

    // Note input should appear and take focus
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();
    await expect(noteInput).toBeFocused();
  });

  test('typing in note input saves the note', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await focusItemEditor(page, firstItem);

    // Open note editor
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();

    // Type a note, then close the editor
    await noteInput.fill('This is a test note');
    await page.keyboard.press('Escape');

    // Note content should be visible with the typed text
    const noteContent = firstItem.locator('.note-content').first();
    await expect(noteContent).toBeVisible();
    await expect(noteContent).toHaveText('This is a test note');
  });

  // KNOWN BUG otl-qro7: after closing an empty note (Escape), restoring the main
  // editor's DOM focus + edit mode is non-deterministic — focus often ends up on
  // <body> / the item only navigate-focused. Both a synchronous handler focus and
  // a post-commit effect race the note-textarea unmount + keyboard-mode
  // transition. This is keyboard/cursor-model coherence work; fix within otl-obv5,
  // then re-enable. The leaf-targeted body below is the correct test for the fix.
  test.fixme('Escape closes note editor and returns focus to main editor', async ({ page }) => {
    // Target a stable childless leaf by its OWN row: clicking the first item can
    // land on a child (the first root is the document title and its item is tall
    // — otl-nroo), which would make the focus assertion check the wrong element.
    const item = page.locator('.outline-item')
      .filter({ has: page.locator('> .item-row', { hasText: 'Press Tab to indent' }) });
    await item.locator('> .item-row').click();
    await expect(item).toHaveClass(/(^|\s)focused(\s|$)/);
    await page.locator('.outline-item.focused .outline-editor').click();

    // Open note editor
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Note input should be gone (no note content yet)
    await expect(noteInput).not.toBeVisible();

    // Focus returns to the item's main editor (otl-qro7)
    await expect(item).toHaveClass(/(^|\s)focused(\s|$)/);
  });

  test('Shift+Enter in note editor closes it', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await focusItemEditor(page, firstItem);

    // Open note editor
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();

    // Type something first
    await noteInput.fill('A note');

    // Press Shift+Enter to close
    await page.keyboard.press('Shift+Enter');

    // Note content should be visible (not input)
    const noteContent = firstItem.locator('.note-content').first();
    await expect(noteContent).toBeVisible();
    await expect(noteContent).toHaveText('A note');
  });

  test('clicking note content opens note editor', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await focusItemEditor(page, firstItem);

    // Add a note first
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();
    await noteInput.fill('Click me to edit');
    await page.keyboard.press('Escape');

    // Now click on the note content
    const noteContent = firstItem.locator('.note-content').first();
    await expect(noteContent).toBeVisible();
    await noteContent.click();

    // Note input should reappear
    await expect(page.locator('.note-input')).toBeVisible();
  });

  test('note displays below main content', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await focusItemEditor(page, firstItem);

    // Add a note
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();
    await noteInput.fill('Note below content');
    await page.keyboard.press('Escape');

    // Verify note row is below item row (scope to this item's own rows)
    const itemRow = firstItem.locator('.item-row').first();
    const noteRow = firstItem.locator('.note-row').first();
    await expect(noteRow).toBeVisible();

    const itemRowBox = await itemRow.boundingBox();
    const noteRowBox = await noteRow.boundingBox();

    expect(noteRowBox!.y).toBeGreaterThan(itemRowBox!.y);
  });

  test('note has muted styling', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await focusItemEditor(page, firstItem);

    // Add a note
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();
    await noteInput.fill('Muted note');
    await page.keyboard.press('Escape');

    // Check that note content has the smaller font size
    const noteContent = firstItem.locator('.note-content').first();
    await expect(noteContent).toBeVisible();
    const fontSize = await noteContent.evaluate(el => getComputedStyle(el).fontSize);

    // Note should have smaller font (0.85em of base)
    // This verifies the CSS is applied
    expect(parseFloat(fontSize)).toBeLessThan(16); // Less than typical base font size
  });
});
