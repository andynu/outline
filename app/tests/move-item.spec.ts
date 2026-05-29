import { test, expect, type Locator, type Page } from '@playwright/test';

// The first root node renders as the document title, not an .outline-item
// (otl-nroo), so root-level reordering only has 2 movable items. Instead we
// reorder the 3 children of "Getting Started" (c1/c2/c3 below), which gives a
// stable 3-sibling group for both single and consecutive moves.
//   c1 = "Press Enter to create a new item"
//   c2 = "Press Tab to indent"
//   c3 = "Press Shift+Tab to outdent"
function gsChildren(page: Page): Locator {
  return page.locator('.outline-container > .outline-item').filter({ hasText: 'Getting Started' }).first()
    .locator('> .children-wrapper > .children > .outline-item');
}

// Focus a child by text and give its editor DOM focus before keyboard ops
// (editor focuses on a setTimeout(0) tick; Ctrl+Arrow is editor-scoped).
async function focusChild(page: Page, text: string) {
  const child = gsChildren(page).filter({ hasText: text }).first();
  await child.locator('.editor-wrapper').first().click();
  await expect(page.locator('.outline-item.focused')).toHaveCount(1);
  await page.locator('.outline-item.focused .outline-editor').click();
}

test.describe('Move item with Ctrl+Arrow keys', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('Ctrl+Down moves item down one position', async ({ page }) => {
    await focusChild(page, 'Press Enter to create a new item'); // c1, position 0
    await page.keyboard.press('Control+ArrowDown');

    // c1 is now at position 1; c2 ("Press Tab to indent") moved up to position 0
    await expect(gsChildren(page).nth(0)).toContainText('Press Tab to indent');
    await expect(gsChildren(page).nth(1)).toContainText('Press Enter to create a new item');
  });

  test('Ctrl+Down works multiple times consecutively', async ({ page }) => {
    await focusChild(page, 'Press Enter to create a new item'); // c1

    await page.keyboard.press('Control+ArrowDown');
    await expect(gsChildren(page).nth(1)).toContainText('Press Enter to create a new item');

    await page.keyboard.press('Control+ArrowDown');
    await expect(gsChildren(page).nth(2)).toContainText('Press Enter to create a new item'); // now last
  });

  test('Ctrl+Up moves item up one position', async ({ page }) => {
    await focusChild(page, 'Press Tab to indent'); // c2, position 1
    await page.keyboard.press('Control+ArrowUp');

    // c2 is now at position 0
    await expect(gsChildren(page).nth(0)).toContainText('Press Tab to indent');
  });

  test('Ctrl+Up works multiple times consecutively', async ({ page }) => {
    await focusChild(page, 'Press Shift+Tab to outdent'); // c3, position 2

    await page.keyboard.press('Control+ArrowUp');
    await expect(gsChildren(page).nth(1)).toContainText('Press Shift+Tab to outdent');

    await page.keyboard.press('Control+ArrowUp');
    await expect(gsChildren(page).nth(0)).toContainText('Press Shift+Tab to outdent'); // now first
  });
});

test.describe('Quick Move dialog (Ctrl+Shift+M)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });
  });

  test('opens quick move dialog and moves item to another parent', async ({ page }) => {
    // Move a Getting Started child under "Features"
    await focusChild(page, 'Press Enter to create a new item');

    // Open quick move dialog
    await page.keyboard.press('Control+Shift+M');
    const dialog = page.locator('.modal-backdrop');
    await expect(dialog).toBeVisible();

    // Search for the target parent
    const searchInput = page.locator('.search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Features');

    const results = page.locator('.result');
    await expect(results.first()).toBeVisible();

    // Press Enter to move to the selected result
    await page.keyboard.press('Enter');
    await expect(dialog).not.toBeVisible();

    // The moved item should now be a child of "Features"
    const features = page.locator('.outline-container > .outline-item').filter({ hasText: 'Features' }).first();
    await expect(
      features.locator('> .children-wrapper > .children > .outline-item').filter({ hasText: 'Press Enter to create a new item' })
    ).toBeVisible();
  });
});
