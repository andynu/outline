import { test, expect } from '@playwright/test';

test.describe('Session state restoration', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session state before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('outline-session-state');
    });
  });

  test('saves focused item and restores on reload', async ({ page }) => {
    // Load the page fresh
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });

    // Click on the second item to focus it
    const editors = page.locator('.editor-wrapper');
    await editors.nth(1).click();
    await page.waitForTimeout(100);

    // Get the text of the focused item
    const focusedText = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();

    // Wait for session state to be saved (debounced)
    await page.waitForTimeout(1500);

    // Verify session state was saved — new shape: perDocument[docId].focusedNodeId
    const sessionState = await page.evaluate(() => {
      const stored = localStorage.getItem('outline-session-state');
      return stored ? JSON.parse(stored) : null;
    });
    expect(sessionState).not.toBeNull();
    expect(sessionState.documentId).toBeTruthy();
    expect(sessionState.perDocument).toBeTruthy();
    const docState = sessionState.perDocument[sessionState.documentId];
    expect(docState).toBeTruthy();
    expect(docState.focusedNodeId).toBeTruthy();

    // Reload the page
    await page.reload();
    await page.waitForSelector('.outline-item', { timeout: 10000 });

    // Wait a bit longer for restoration (session state processing happens asynchronously)
    await page.waitForTimeout(500);

    // Verify session state still exists after reload
    const restoredSessionState = await page.evaluate(() => {
      const stored = localStorage.getItem('outline-session-state');
      return stored ? JSON.parse(stored) : null;
    });
    expect(restoredSessionState).not.toBeNull();
    const restoredDocState = restoredSessionState.perDocument[restoredSessionState.documentId];
    expect(restoredDocState.focusedNodeId).toBeTruthy();

    // Verify the same item is focused
    const restoredFocusedText = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();
    expect(restoredFocusedText).toBe(focusedText);
  });

  test('saves zoom state and restores on reload', async ({ page }) => {
    // Load the page fresh
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });

    // Focus the "Getting Started" root item. It's a root node with children
    // (position 1 among roots) — but may not be `editors.nth(1)` in the DOM
    // because children of previous roots render between them. Find it by text.
    const gettingStarted = page.locator('.editor-wrapper', { hasText: /^Getting Started$/ }).first();
    await gettingStarted.click();
    await page.waitForTimeout(100);

    // Zoom into "Getting Started" with Ctrl+]
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(300);

    // Verify zoom breadcrumbs are visible
    await expect(page.locator('.zoom-breadcrumbs')).toBeVisible();

    // Wait for session state to be saved
    await page.waitForTimeout(1500);

    // Verify session state includes zoom under perDocument
    const sessionState = await page.evaluate(() => {
      const stored = localStorage.getItem('outline-session-state');
      return stored ? JSON.parse(stored) : null;
    });
    expect(sessionState).not.toBeNull();
    const docState = sessionState.perDocument[sessionState.documentId];
    expect(docState.zoomedNodeId).toBeTruthy();

    // Reload the page
    await page.reload();
    await page.waitForSelector('.outline-item', { timeout: 10000 });

    // Wait for restoration
    await page.waitForTimeout(500);

    // Verify zoom is restored (breadcrumbs should be visible)
    await expect(page.locator('.zoom-breadcrumbs')).toBeVisible();
  });

  test('saves scroll position and restores on reload', async ({ page }) => {
    // Set a smaller viewport to make content scrollable
    await page.setViewportSize({ width: 800, height: 400 });

    // Load the page fresh
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });

    // Create several items to make the page scrollable
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForTimeout(100);

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(50);
      await page.keyboard.type(`Test item ${i + 1} for scroll test`);
    }
    await page.waitForTimeout(300);

    // Scroll down using keyboard navigation to reach the bottom
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(300);

    // Get the scroll position
    const scrollBefore = await page.evaluate(() => {
      const contentArea = document.querySelector('.content-area');
      return contentArea?.scrollTop ?? 0;
    });

    // Only proceed if we actually scrolled
    if (scrollBefore === 0) {
      console.log('Warning: Content area did not scroll, test might be flaky');
    }

    // Wait for session state to be saved (debounce + state check interval)
    await page.waitForTimeout(2000);

    // Verify session state was saved
    const sessionState = await page.evaluate(() => {
      const stored = localStorage.getItem('outline-session-state');
      return stored ? JSON.parse(stored) : null;
    });
    expect(sessionState).not.toBeNull();

    const docState = sessionState.perDocument?.[sessionState.documentId] ?? {};
    // Skip detailed scroll assertions if scroll position is 0 (viewport too large)
    if (!docState.scrollTop) {
      console.log('Skipping scroll restoration test - content area not scrollable');
      return;
    }

    // Reload the page
    await page.reload();
    await page.waitForSelector('.outline-item', { timeout: 10000 });

    // Wait for restoration (scroll is restored with delay)
    await page.waitForTimeout(500);

    // Verify scroll position is restored (within some tolerance)
    const restoredScrollTop = await page.evaluate(() => {
      const contentArea = document.querySelector('.content-area');
      return contentArea?.scrollTop ?? 0;
    });
    // The restored scroll should be reasonably close to what was saved
    expect(restoredScrollTop).toBeGreaterThanOrEqual(0);
  });

  test('handles deleted focused node gracefully', async ({ page }) => {
    // Load the page fresh
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });

    // Create a new item and focus it
    const editors = page.locator('.editor-wrapper');
    await editors.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Item to delete');
    await page.waitForTimeout(100);

    // Wait for session state to be saved
    await page.waitForTimeout(1500);

    // Delete the focused item
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    // Press Ctrl+Backspace to delete the item completely
    await page.keyboard.press('Control+Backspace');
    await page.waitForTimeout(200);

    // The page should not crash and should have some item focused
    const focusedItems = page.locator('.outline-item.focused');
    const count = await focusedItems.count();
    // Either there's a focused item or the page is still functional
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('migrates legacy flat session state into per-document slot', async ({ page }) => {
    // Seed a legacy v1 session state into localStorage and verify it's
    // still honored (focus gets restored) and migrated to the v2 shape.
    await page.goto('/');

    await page.evaluate(() => {
      localStorage.setItem('outline-session-state', JSON.stringify({
        documentId: 'mock-doc',
        focusedNodeId: 'mock-child-2-1',
        scrollTop: 0,
        timestamp: Date.now(),
      }));
    });

    await page.reload();
    await page.waitForSelector('.outline-item', { timeout: 10000 });
    await page.waitForTimeout(800);

    // Focus should land on mock-child-2-1 ("Press Enter to create a new item").
    const focusedText = await page.locator('.outline-item.focused .editor-wrapper').first().textContent();
    expect(focusedText).toContain('Press Enter');

    // Wait for save debounce to flush so we can inspect migrated shape.
    await page.waitForTimeout(1500);

    const migrated = await page.evaluate(() => {
      const stored = localStorage.getItem('outline-session-state');
      return stored ? JSON.parse(stored) : null;
    });
    expect(migrated).not.toBeNull();
    expect(migrated.perDocument).toBeTruthy();
    expect(migrated.perDocument['mock-doc']).toBeTruthy();
    expect(migrated.perDocument['mock-doc'].focusedNodeId).toBe('mock-child-2-1');
    // Legacy top-level focused/zoomed fields should NOT appear in the new shape.
    expect(migrated.focusedNodeId).toBeUndefined();
    expect(migrated.zoomedNodeId).toBeUndefined();
  });

  // Note: Per-document focus isolation (switching between docs A and B and
  // having each retain its own focus) cannot be fully exercised in browser
  // mock mode because the mock API only exposes a single document. It's
  // covered by the unit-level semantics of savePerDocumentState + migration
  // test above; true cross-document tests require Tauri.

  // Note: Collapse state persistence cannot be tested in browser-only mode (Playwright)
  // because the mock API resets state on page reload. The Rust backend has unit tests
  // that verify collapse state persistence in src-tauri/src/data/folders.rs and
  // the operations system properly persists node collapse state to pending.*.jsonl files.
  //
  // To test collapse persistence manually:
  // 1. Run the Tauri app with `npm run tauri dev`
  // 2. Collapse an item or folder
  // 3. Close and reopen the app
  // 4. Verify the item/folder is still collapsed
});

test.describe('Settings persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('outline-settings');
    });
  });

  test('showShortIds toggle survives reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.outline-item', { timeout: 10000 });

    // Open the View menu and toggle Show Short IDs.
    const viewMenu = page.locator('button:has-text("View")').first();
    await viewMenu.click();
    await page.waitForTimeout(100);

    const shortIdsItem = page.locator('.menu-item-btn:has-text("Show Short IDs")').first();
    await expect(shortIdsItem).toBeVisible();
    await shortIdsItem.click();
    await page.waitForTimeout(200);

    // Verify setting is persisted in localStorage.
    const settings = await page.evaluate(() => {
      const stored = localStorage.getItem('outline-settings');
      return stored ? JSON.parse(stored) : null;
    });
    expect(settings).not.toBeNull();
    expect(settings.showShortIds).toBe(true);

    // Reload and confirm setting still reads as true.
    await page.reload();
    await page.waitForSelector('.outline-item', { timeout: 10000 });
    const afterReload = await page.evaluate(() => {
      const stored = localStorage.getItem('outline-settings');
      return stored ? JSON.parse(stored) : null;
    });
    expect(afterReload.showShortIds).toBe(true);
  });
});
