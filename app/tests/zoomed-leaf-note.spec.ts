import { test, expect, type Page } from '@playwright/test';

// Create a new leaf node off the first item, name it, and return with the leaf
// focused. Each step is gated on observed state (focused count, typed text) so
// it can't race the editor's setTimeout(0) auto-focus: clicking the item sets
// React focus, but the contenteditable gets DOM focus a tick later, so a bare
// item-click + type drops characters under load and leaves the leaf unnamed —
// which then zooms the wrong (non-leaf) node. Mirrors vim-navigation's
// buildVimTree. Only the focused item renders .outline-editor (others static),
// so the selector is unique.
async function createNamedLeaf(page: Page, name: string) {
  await page.locator('.editor-wrapper').first().click();
  await expect(page.locator('.outline-item.focused')).toHaveCount(1);
  await page.locator('.outline-item.focused .outline-editor').click();

  // Enter creates a new (leaf) sibling and focuses it; click its editor for DOM
  // focus before typing, then confirm the text actually landed.
  await page.keyboard.press('Enter');
  await expect(page.locator('.outline-item.focused')).toHaveCount(1);
  await page.locator('.outline-item.focused .outline-editor').click();
  await page.keyboard.type(name);
  await expect(page.locator('.outline-item.focused .outline-editor')).toHaveText(name);
}

test.describe('Zoomed leaf node note editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item');
  });

  test('zooming into a leaf node shows the note editor', async ({ page }) => {
    await createNamedLeaf(page, 'Leaf node for testing');

    // Zoom into this leaf node with Ctrl+]
    await page.keyboard.press('Control+]');

    // Breadcrumbs should be visible (we're zoomed)
    await expect(page.locator('.zoom-breadcrumbs')).toBeVisible();

    // The zoomed leaf note editor should appear
    await expect(page.locator('.zoomed-leaf-note')).toBeVisible();

    // It should show the node title
    await expect(page.locator('.zoomed-leaf-note-title')).toContainText('Leaf node for testing');

    // It should show the Notes label
    await expect(page.locator('.zoomed-leaf-note-label')).toHaveText('Notes');

    // The note editor body should be present and editable
    const noteBody = page.locator('.zoomed-leaf-note-body .tiptap');
    await expect(noteBody).toBeVisible();
  });

  test('can type in the zoomed leaf note editor', async ({ page }) => {
    await createNamedLeaf(page, 'Note test node');

    // Zoom in
    await page.keyboard.press('Control+]');

    // The editor should be present and ready to type
    const noteEditor = page.locator('.zoomed-leaf-note-body .tiptap');
    await expect(noteEditor).toBeVisible();

    // Type in the note editor
    await noteEditor.click();
    await page.keyboard.type('This is my note content');

    // The text should appear in the editor
    await expect(noteEditor).toContainText('This is my note content');
  });

  test('zooming out of leaf node returns to normal tree view', async ({ page }) => {
    await createNamedLeaf(page, 'Temporary leaf');

    // Zoom in
    await page.keyboard.press('Control+]');

    // Should see the leaf note editor
    await expect(page.locator('.zoomed-leaf-note')).toBeVisible();

    // Zoom out with Ctrl+[
    await page.keyboard.press('Control+[');

    // Should be back to normal tree view (no leaf note editor)
    await expect(page.locator('.zoomed-leaf-note')).not.toBeVisible();

    // Normal outline items should be visible
    await expect(page.locator('.outline-item').first()).toBeVisible();
  });

  test('note content persists after zooming out and back in', async ({ page }) => {
    await createNamedLeaf(page, 'Persistent note node');

    // Zoom in
    await page.keyboard.press('Control+]');

    // Type a note
    const noteEditor = page.locator('.zoomed-leaf-note-body .tiptap');
    await expect(noteEditor).toBeVisible();
    await noteEditor.click();
    await page.keyboard.type('Persistent content here');
    await expect(noteEditor).toContainText('Persistent content here');

    // Zoom out
    await page.keyboard.press('Control+[');
    await expect(page.locator('.zoomed-leaf-note')).not.toBeVisible();

    // Zoom back in — focus the node first via its editor-wrapper
    const nodeItem = page.locator('.editor-wrapper', { hasText: 'Persistent note node' });
    await nodeItem.click();
    await expect(page.locator('.outline-item.focused')).toHaveCount(1);
    await page.locator('.outline-item.focused .outline-editor').click();
    await page.keyboard.press('Control+]');

    // The note content should still be there
    const noteEditorAgain = page.locator('.zoomed-leaf-note-body .tiptap');
    await expect(noteEditorAgain).toContainText('Persistent content here');
  });
});
