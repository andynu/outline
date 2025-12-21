import { test, expect } from '@playwright/test';

test.describe('Secondary notes field', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.outline-item');
  });

  test('Shift+Enter opens note editor', async ({ page }) => {
    // Focus the first item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Press Shift+Enter to open note editor
    await page.keyboard.press('Shift+Enter');

    // Note input should appear
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();
    await expect(noteInput).toBeFocused();
  });

  test('typing in note input saves the note', async ({ page }) => {
    // Focus the first item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Open note editor
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();

    // Type a note
    await noteInput.fill('This is a test note');
    await page.waitForTimeout(100);

    // Click elsewhere to close the note editor
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Note content should be visible
    const noteContent = firstItem.locator('.note-content');
    await expect(noteContent).toBeVisible();
    await expect(noteContent).toHaveText('This is a test note');
  });

  test('Escape closes note editor and returns focus to main editor', async ({ page }) => {
    // Focus the first item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Open note editor
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Note input should be gone (no note content yet)
    await expect(noteInput).not.toBeVisible();

    // Item should still be focused
    await expect(firstItem).toHaveClass(/focused/);
  });

  test('Shift+Enter in note editor closes it', async ({ page }) => {
    // Focus the first item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Open note editor
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await expect(noteInput).toBeVisible();

    // Type something first
    await noteInput.fill('A note');
    await page.waitForTimeout(100);

    // Press Shift+Enter to close
    await page.keyboard.press('Shift+Enter');

    // Note content should be visible (not input)
    const noteContent = firstItem.locator('.note-content');
    await expect(noteContent).toBeVisible();
    await expect(noteContent).toHaveText('A note');
  });

  test('clicking note content opens note editor', async ({ page }) => {
    // Focus the first item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Add a note first
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await noteInput.fill('Click me to edit');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Now click on the note content
    const noteContent = firstItem.locator('.note-content');
    await noteContent.click();
    await page.waitForTimeout(100);

    // Note input should reappear
    await expect(page.locator('.note-input')).toBeVisible();
  });

  test('note displays below main content', async ({ page }) => {
    // Focus the first item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Add a note
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await noteInput.fill('Note below content');
    await page.keyboard.press('Escape');

    // Verify note row is below item row
    const itemRow = firstItem.locator('.item-row');
    const noteRow = firstItem.locator('.note-row');

    const itemRowBox = await itemRow.boundingBox();
    const noteRowBox = await noteRow.boundingBox();

    expect(noteRowBox!.y).toBeGreaterThan(itemRowBox!.y);
  });

  test('note has muted styling', async ({ page }) => {
    // Focus the first item
    const firstItem = page.locator('.outline-item').first();
    await firstItem.click();
    await page.waitForSelector('.outline-item.focused');

    // Add a note
    await page.keyboard.press('Shift+Enter');
    const noteInput = page.locator('.note-input');
    await noteInput.fill('Muted note');
    await page.keyboard.press('Escape');

    // Check that note content has the smaller font size
    const noteContent = firstItem.locator('.note-content');
    const fontSize = await noteContent.evaluate(el => getComputedStyle(el).fontSize);

    // Note should have smaller font (0.85em of base)
    // This verifies the CSS is applied
    expect(parseFloat(fontSize)).toBeLessThan(16); // Less than typical base font size
  });
});
