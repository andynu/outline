import { test, expect } from '@playwright/test';

test.describe('Note editor (dive-in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('opens note editor via context menu', async ({ page }) => {
    // Right-click on first item to open context menu
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);

    // Click "Edit Note" in context menu
    const editNoteItem = page.locator('.menu-item').filter({ hasText: 'Edit Note' });
    await expect(editNoteItem).toBeVisible({ timeout: 3000 });
    await editNoteItem.click();

    // Note editor view should appear
    const noteEditorView = page.locator('.note-editor-view');
    await expect(noteEditorView).toBeVisible({ timeout: 3000 });

    // Should show the back button
    const backButton = page.locator('.note-editor-back');
    await expect(backButton).toBeVisible();

    // Should show the node title in the header
    const noteTitle = page.locator('.note-editor-title');
    await expect(noteTitle).toBeVisible();
  });

  test('opens note editor via keyboard shortcut Ctrl+Shift+Enter', async ({ page }) => {
    // Click on first item to focus it
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForTimeout(100);

    // Press Ctrl+Shift+Enter to open note editor
    await page.keyboard.press('Control+Shift+Enter');

    // Note editor view should appear
    const noteEditorView = page.locator('.note-editor-view');
    await expect(noteEditorView).toBeVisible({ timeout: 3000 });
  });

  test('closes note editor with Escape', async ({ page }) => {
    // Open note editor
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);
    await page.locator('.menu-item').filter({ hasText: 'Edit Note' }).click();
    await expect(page.locator('.note-editor-view')).toBeVisible({ timeout: 3000 });

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Note editor should be gone, outline should be visible again
    await expect(page.locator('.note-editor-view')).not.toBeVisible();
    await expect(page.locator('.outline-container')).toBeVisible();
  });

  test('closes note editor with back button', async ({ page }) => {
    // Open note editor
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);
    await page.locator('.menu-item').filter({ hasText: 'Edit Note' }).click();
    await expect(page.locator('.note-editor-view')).toBeVisible({ timeout: 3000 });

    // Click back button
    await page.locator('.note-editor-back').click();

    // Note editor should be gone
    await expect(page.locator('.note-editor-view')).not.toBeVisible();
    await expect(page.locator('.outline-container')).toBeVisible();
  });

  test('typing in note editor persists content', async ({ page }) => {
    // Open note editor
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);
    await page.locator('.menu-item').filter({ hasText: 'Edit Note' }).click();
    await expect(page.locator('.note-editor-view')).toBeVisible({ timeout: 3000 });

    // Type some text in the editor
    const editorContent = page.locator('.note-editor-content');
    await editorContent.click();
    await page.keyboard.type('This is a test note');
    await page.waitForTimeout(400); // wait for debounce

    // Close and reopen - note should persist
    await page.keyboard.press('Escape');
    await expect(page.locator('.note-editor-view')).not.toBeVisible();

    // Check that the note content shows in the outline item's note row
    const noteContent = page.locator('.note-content').first();
    await expect(noteContent).toContainText('This is a test note');
  });

  test('note editor has TipTap editor with editing capabilities', async ({ page }) => {
    // Open note editor
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);
    await page.locator('.menu-item').filter({ hasText: 'Edit Note' }).click();
    await expect(page.locator('.note-editor-view')).toBeVisible({ timeout: 3000 });

    // The TipTap editor should be present (with contenteditable)
    const tiptapEditor = page.locator('.note-editor-body .tiptap');
    await expect(tiptapEditor).toBeVisible();
    await expect(tiptapEditor).toHaveAttribute('contenteditable', 'true');
  });

  test('hides outline view when note editor is open', async ({ page }) => {
    // Verify outline is initially visible
    await expect(page.locator('.outline-container')).toBeVisible();

    // Open note editor
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click({ button: 'right' });
    await page.waitForTimeout(100);
    await page.locator('.menu-item').filter({ hasText: 'Edit Note' }).click();
    await expect(page.locator('.note-editor-view')).toBeVisible({ timeout: 3000 });

    // Outline should be hidden
    await expect(page.locator('.outline-container')).not.toBeVisible();
  });
});
