import { test, expect } from '@playwright/test';

test.describe('Markdown links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item');
    // The first root node becomes the document title (otl-nroo) and which-it-is
    // races on load, so a bare .outline-item.first() click edits an inconsistent
    // target. Wait for the title editor, then focus "Getting Started" (the first
    // stable outline item) with real editor DOM focus before typing.
    await page.waitForSelector('.document-title-editor-inner');
    const gs = page.locator('.outline-container > .outline-item').filter({ hasText: 'Getting Started' }).first();
    await gs.locator('> .item-row').click();
    await expect(page.locator('.outline-item.focused')).toHaveCount(1);
    await page.locator('.outline-item.focused .outline-editor').click();
  });

  test('shows styled markdown syntax while editing', async ({ page }) => {
    // Get the focused editor and type a markdown link
    const editor = page.locator('.outline-item.focused .outline-editor');
    await editor.fill('Check out [Google](https://google.com) for more');

    // Wait for content to update
    await page.waitForTimeout(200);

    // While focused, markdown links show full syntax with styling
    const linkSyntax = page.locator('.outline-item.focused .markdown-link-syntax');
    await expect(linkSyntax).toBeVisible();
    // The full markdown syntax should be visible (for editing)
    await expect(linkSyntax).toContainText('[Google](https://google.com)');
  });

  test('markdown link has href data attribute for click handling', async ({ page }) => {
    // Get the focused editor and type a markdown link
    const editor = page.locator('.outline-item.focused .outline-editor');
    await editor.fill('Visit [My Site](https://example.com) today');

    // Wait for decoration to apply
    await page.waitForTimeout(200);

    // The syntax span should have the href in data attribute for click handling
    const linkSyntax = page.locator('.outline-item.focused .markdown-link-syntax');
    await expect(linkSyntax).toBeVisible();
    await expect(linkSyntax).toHaveAttribute('data-href', 'https://example.com');
  });

  test('markdown link with www URL gets https prefix', async ({ page }) => {
    // Type a markdown link with www URL
    const editor = page.locator('.outline-item.focused .outline-editor');
    await editor.fill('Go to [Example](www.example.com)');

    await page.waitForTimeout(200);

    // Check that data-href has https:// prefixed
    const linkSyntax = page.locator('.outline-item.focused .markdown-link-syntax');
    await expect(linkSyntax).toHaveAttribute('data-href', 'https://www.example.com');
  });

  test('static content renders markdown link as simple anchor', async ({ page }) => {
    // Type a markdown link
    const editor = page.locator('.outline-item.focused .outline-editor');
    await editor.fill('Click [Test Link](https://example.com)');
    await page.waitForTimeout(200);

    // Press down arrow to move focus away and trigger static rendering
    await page.locator('.outline-container > .outline-item').nth(1).locator('> .item-row').click();
    await expect(page.locator('.outline-item').first()).not.toHaveClass(/(^|\s)focused(\s|$)/);

    // Now the first item should be unfocused and use static rendering
    // In static mode, markdown links are rendered as regular anchors showing just the text
    const firstItem = page.locator('.outline-item').first();
    const link = firstItem.locator('a.markdown-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('Test Link');
    await expect(link).toHaveAttribute('href', 'https://example.com');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('unfocused item hides URL and shows only link text', async ({ page }) => {
    // Type a markdown link
    const editor = page.locator('.outline-item.focused .outline-editor');
    await editor.fill('See [documentation](https://docs.example.com) here');
    await page.waitForTimeout(200);

    // Press down arrow to unfocus
    await page.locator('.outline-container > .outline-item').nth(1).locator('> .item-row').click();
    await expect(page.locator('.outline-item').first()).not.toHaveClass(/(^|\s)focused(\s|$)/);

    // In static rendering, the URL syntax should not be visible
    const firstItem = page.locator('.outline-item').first();
    // Scope to the item's OWN static-content (.first()); the first outline item
    // has children whose .static-content would also match (strict-mode violation).
    const staticContent = firstItem.locator('.static-content').first();
    await expect(staticContent).toBeVisible();

    // Get the visible text - the markdown link should be replaced by just the display text
    const link = staticContent.locator('a.markdown-link');
    await expect(link).toHaveText('documentation');

    // The surrounding text should still be there
    const text = await staticContent.textContent();
    expect(text).toContain('See');
    expect(text).toContain('here');
    // The URL should not be visible in the text
    expect(text).not.toContain('https://');
    expect(text).not.toContain('](');
  });

  test('bare domain URLs render as links in static content', async ({ page }) => {
    // Type a markdown link with a bare domain (no protocol)
    const editor = page.locator('.outline-item.focused .outline-editor');
    await editor.fill('Visit [Google](google.com) for search');
    await page.waitForTimeout(200);

    // Press down arrow to unfocus
    await page.locator('.outline-container > .outline-item').nth(1).locator('> .item-row').click();
    await expect(page.locator('.outline-item').first()).not.toHaveClass(/(^|\s)focused(\s|$)/);

    // The link should be rendered with https:// protocol added
    const firstItem = page.locator('.outline-item').first();
    const link = firstItem.locator('a.markdown-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('Google');
    await expect(link).toHaveAttribute('href', 'https://google.com');
  });

  test('bare domain URLs with path render correctly', async ({ page }) => {
    // Type a markdown link with domain and path
    const editor = page.locator('.outline-item.focused .outline-editor');
    await editor.fill('Check [the docs](example.com/path/to/page) out');
    await page.waitForTimeout(200);

    // Press down arrow to unfocus
    await page.locator('.outline-container > .outline-item').nth(1).locator('> .item-row').click();
    await expect(page.locator('.outline-item').first()).not.toHaveClass(/(^|\s)focused(\s|$)/);

    // The link should be rendered correctly
    const firstItem = page.locator('.outline-item').first();
    const link = firstItem.locator('a.markdown-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('the docs');
    await expect(link).toHaveAttribute('href', 'https://example.com/path/to/page');
  });
});
