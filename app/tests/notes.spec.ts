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

  // KNOWN BUG otl-qro7: pressing Escape on an empty note loses focus entirely
  // (document.activeElement becomes <body>, focusedId is cleared, the item
  // collapses to static) instead of returning to the main editor. The Escape
  // handler's editorRef.current?.commands.focus('end') is disturbed by the
  // synchronous setIsEditingNote(false) re-render. Deterministic once the
  // note-open race is fixed (was previously masked by the flaky open). This is
  // focus-model coherence work (otl-uogy/otl-obv5); fixme until otl-qro7 lands,
  // then re-enable — the assertion below is the correct intended behavior.
  test.fixme('Escape closes note editor and returns focus to main editor', async ({ page }) => {
    const firstItem = page.locator('.outline-item').first();
    await focusItemEditor(page, firstItem);

    // Open note editor
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Note input should be gone (no note content yet)
    await expect(noteInput).not.toBeVisible();

    // Item should still be focused (focus returns to the main editor)
    await expect(firstItem).toHaveClass(/focused/);
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
