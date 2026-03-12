import { test, expect } from '@playwright/test';

test.describe('Zoomed leaf node note editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item');
  });

  test('zooming into a leaf node shows the note editor', async ({ page }) => {
    // Focus the first item (which likely has children, so create a known leaf)
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForSelector('.outline-item.focused');

    // Create a new child (will be a leaf node)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Leaf node for testing');
    await page.waitForTimeout(100);

    // Zoom into this leaf node with Ctrl+]
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(300);

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
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForSelector('.outline-item.focused');

    // Create a leaf node
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Note test node');
    await page.waitForTimeout(100);

    // Zoom in
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(300);

    // The editor should be focused and ready to type
    const noteEditor = page.locator('.zoomed-leaf-note-body .tiptap');
    await expect(noteEditor).toBeVisible();

    // Type in the note editor
    await noteEditor.click();
    await page.keyboard.type('This is my note content');
    await page.waitForTimeout(200);

    // The text should appear in the editor
    await expect(noteEditor).toContainText('This is my note content');
  });

  test('zooming out of leaf node returns to normal tree view', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForSelector('.outline-item.focused');

    // Create a leaf node
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Temporary leaf');
    await page.waitForTimeout(100);

    // Zoom in
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(300);

    // Should see the leaf note editor
    await expect(page.locator('.zoomed-leaf-note')).toBeVisible();

    // Zoom out with Ctrl+[
    await page.keyboard.press('Control+[');
    await page.waitForTimeout(300);

    // Should be back to normal tree view (no leaf note editor)
    await expect(page.locator('.zoomed-leaf-note')).not.toBeVisible();

    // Normal outline items should be visible
    await expect(page.locator('.outline-item').first()).toBeVisible();
  });

  test('note content persists after zooming out and back in', async ({ page }) => {
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForSelector('.outline-item.focused');

    // Create a leaf node
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Persistent note node');
    await page.waitForTimeout(100);

    // Zoom in
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(300);

    // Type a note
    const noteEditor = page.locator('.zoomed-leaf-note-body .tiptap');
    await noteEditor.click();
    await page.keyboard.type('Persistent content here');
    await page.waitForTimeout(200);

    // Zoom out
    await page.keyboard.press('Control+[');
    await page.waitForTimeout(300);

    // Zoom back in — need to focus the node first via its editor-wrapper
    const nodeItem = page.locator('.editor-wrapper', { hasText: 'Persistent note node' });
    await nodeItem.click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(400);

    // The note content should still be there
    const noteEditorAgain = page.locator('.zoomed-leaf-note-body .tiptap');
    await expect(noteEditorAgain).toContainText('Persistent content here');
  });
});
