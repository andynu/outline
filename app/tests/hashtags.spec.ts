import { test, expect } from '@playwright/test';

test.describe('Hashtags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the outline to load
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('typing # at start of line opens suggestion popup', async ({ page }) => {
    // Create a new item first so we start at the beginning
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    // Create new empty item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type # at the start of the line
    await page.keyboard.type('#', { delay: 50 });
    await page.waitForTimeout(300);

    // Check that the suggestion popup appears
    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });
  });

  test('typing # after space opens suggestion popup', async ({ page }) => {
    // Create a new item
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type some text then space then #
    await page.keyboard.type('text ', { delay: 50 });
    await page.waitForTimeout(100);
    await page.keyboard.type('#', { delay: 50 });
    await page.waitForTimeout(300);

    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });
  });

  test('typing tag name after # shows option with tag name', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type #newtag
    await page.keyboard.type('#', { delay: 50 });
    await page.waitForTimeout(300);

    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });

    await page.keyboard.type('newtag', { delay: 50 });
    await page.waitForTimeout(200);

    // Should show the tag in suggestions (either as create option or hint)
    const suggestionItem = page.locator('.suggestion-item');
    await expect(suggestionItem.first()).toBeVisible();
  });

  test('Enter selects/creates hashtag inline without adding newline', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type #testtag
    await page.keyboard.type('#', { delay: 50 });
    await page.waitForTimeout(300);

    await page.keyboard.type('testtag', { delay: 50 });
    await page.waitForTimeout(200);

    // Press Enter to create
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // The popup should close
    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).not.toBeVisible();

    // The hashtag should be rendered (as decoration)
    const hashtag = page.locator('.hashtag');
    await expect(hashtag).toBeVisible();
    await expect(hashtag).toContainText('#testtag');

    // The editor should have only one paragraph (no extra newline inserted)
    const focusedEditor = page.locator('.outline-item.focused .outline-editor');
    const paragraphs = focusedEditor.locator('p');
    await expect(paragraphs).toHaveCount(1);
  });

  test('hashtag renders with styling after typing', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type #styled then space to complete
    await page.keyboard.type('#styled ', { delay: 50 });
    await page.waitForTimeout(200);

    // Check the hashtag element has the hashtag class
    const hashtag = page.locator('.hashtag');
    await expect(hashtag).toBeVisible();
    await expect(hashtag).toContainText('#styled');
  });

  test('Escape closes hashtag suggestion', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type # to trigger suggestion
    await page.keyboard.type('#', { delay: 50 });
    await page.waitForTimeout(300);

    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Popup should close
    await expect(suggestionPopup).not.toBeVisible();
  });

  test('clicking suggestion selects it', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type #
    await page.keyboard.type('#', { delay: 50 });
    await page.waitForTimeout(300);

    // Type tag name
    await page.keyboard.type('clicktest', { delay: 50 });
    await page.waitForTimeout(200);

    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible();

    // Click the create option
    const createOption = page.locator('.suggestion-item').first();
    await createOption.click();
    await page.waitForTimeout(200);

    // Hashtag should be created
    const hashtag = page.locator('.hashtag');
    await expect(hashtag).toBeVisible();
  });

  test('existing tags shown in suggestions after creating one', async ({ page }) => {
    const firstEditor = page.locator('.editor-wrapper').first();
    await firstEditor.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Create a hashtag first by typing and accepting
    await page.keyboard.type('#', { delay: 50 });
    await page.waitForTimeout(300);

    await page.keyboard.type('existingtag', { delay: 50 });
    await page.waitForTimeout(200);

    // Press Enter to create
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Type a space then trigger again
    await page.keyboard.type(' ', { delay: 50 });
    await page.waitForTimeout(100);

    await page.keyboard.type('#', { delay: 50 });
    await page.waitForTimeout(300);

    const suggestionPopup = page.locator('.suggestion-popup');
    await expect(suggestionPopup).toBeVisible({ timeout: 3000 });

    // Should show our existing tag in suggestions (existing tags appear at top)
    const tagSuggestion = page.locator('.suggestion-item .tag-name');
    await expect(tagSuggestion.first()).toBeVisible();
    await expect(tagSuggestion.first()).toContainText('existingtag');
  });
});
