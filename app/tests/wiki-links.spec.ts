import { test, expect } from '@playwright/test';

test.describe('Wiki links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('typing [[ opens suggestion popup', async ({ page }) => {
    // Click on first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Type [[ with delay to trigger the handler
    await page.keyboard.type('[[', { delay: 50 });
    await page.waitForTimeout(200);

    // Check that the suggestion popup appears
    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });
  });

  test('typing filters suggestions', async ({ page }) => {
    // Click on first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Type [[ then search query
    await page.keyboard.type('[[', { delay: 50 });
    await page.waitForTimeout(200);

    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });

    // Type "Welcome" to filter to the Welcome item
    await page.keyboard.type('Welcome', { delay: 50 });
    await page.waitForTimeout(300);

    // Should show suggestions matching "Welcome"
    const suggestionItem = page.locator('.suggestion-item');
    await expect(suggestionItem.first()).toBeVisible();

    // The suggestion should contain "Welcome"
    const suggestionText = await suggestionItem.first().textContent();
    expect(suggestionText?.toLowerCase()).toContain('welcome');
  });

  test('Enter selects suggestion and inserts wiki link', async ({ page }) => {
    // Click on first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Type [[ then search query
    await page.keyboard.type('[[', { delay: 50 });
    await page.waitForTimeout(200);

    await page.keyboard.type('Features', { delay: 50 });
    await page.waitForTimeout(300);

    // Wait for suggestion to appear
    const suggestionItem = page.locator('.suggestion-item').first();
    await expect(suggestionItem).toBeVisible({ timeout: 3000 });

    // Press Enter to select
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // The suggestion popup should close
    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).not.toBeVisible();

    // A wiki link should be inserted
    const wikiLink = page.locator('.wiki-link');
    await expect(wikiLink).toBeVisible();
  });

  test('wiki link renders as pill', async ({ page }) => {
    // Create a wiki link first
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.type('[[', { delay: 50 });
    await page.waitForTimeout(200);

    await page.keyboard.type('Features', { delay: 50 });
    await page.waitForTimeout(300);

    const suggestionItem = page.locator('.suggestion-item').first();
    await expect(suggestionItem).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Check that wiki link has the wiki-link class
    const wikiLink = page.locator('.wiki-link');
    await expect(wikiLink).toBeVisible();

    // It should have a data-node-id attribute
    const nodeId = await wikiLink.getAttribute('data-node-id');
    expect(nodeId).toBeTruthy();
  });

  test('Escape closes suggestion popup', async ({ page }) => {
    // Click on first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Type [[ to trigger suggestion
    await page.keyboard.type('[[', { delay: 50 });
    await page.waitForTimeout(200);

    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });

    // Press Escape to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Popup should be hidden
    await expect(suggestionPopup).not.toBeVisible();
  });

  test('clicking suggestion selects it', async ({ page }) => {
    // Click on first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.type('[[', { delay: 50 });
    await page.waitForTimeout(200);

    await page.keyboard.type('Getting', { delay: 50 });
    await page.waitForTimeout(300);

    // Wait for suggestion to appear
    const suggestionItem = page.locator('.suggestion-item').first();
    await expect(suggestionItem).toBeVisible({ timeout: 3000 });

    // Click on the suggestion
    await suggestionItem.click();
    await page.waitForTimeout(200);

    // A wiki link should be inserted
    const wikiLink = page.locator('.wiki-link');
    await expect(wikiLink).toBeVisible();

    // Popup should close
    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).not.toBeVisible();
  });

  test('arrow keys navigate suggestions', async ({ page }) => {
    // Click on first editor
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Type [[e to get multiple results (hopefully)
    await page.keyboard.type('[[', { delay: 50 });
    await page.waitForTimeout(200);

    await page.keyboard.type('e', { delay: 50 });
    await page.waitForTimeout(300);

    const suggestionItems = page.locator('.suggestion-item');
    const count = await suggestionItems.count();

    if (count >= 2) {
      // First item should be selected
      await expect(suggestionItems.first()).toHaveClass(/selected/);

      // Press down arrow
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);

      // Second item should now be selected
      await expect(suggestionItems.nth(1)).toHaveClass(/selected/);

      // Press up arrow
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);

      // First item should be selected again
      await expect(suggestionItems.first()).toHaveClass(/selected/);
    }
  });

  test('clicking wiki link navigates to target', async ({ page }) => {
    // First create a wiki link
    const firstEditor = page.locator('.outline-editor').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.type('[[', { delay: 50 });
    await page.waitForTimeout(200);

    await page.keyboard.type('Features', { delay: 50 });
    await page.waitForTimeout(300);

    const suggestionItem = page.locator('.suggestion-item').first();
    await expect(suggestionItem).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Get the wiki link
    const wikiLink = page.locator('.wiki-link').first();
    const targetNodeId = await wikiLink.getAttribute('data-node-id');

    // Click on the wiki link
    await wikiLink.click();
    await page.waitForTimeout(200);

    // The target item should now be focused
    const focusedItem = page.locator('.outline-item.focused');
    await expect(focusedItem).toBeVisible();

    // The focused item should contain "Features" (the target)
    const focusedText = await focusedItem.locator('.editor-wrapper').first().textContent();
    expect(focusedText?.toLowerCase()).toContain('features');
  });

});
