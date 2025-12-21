import { test, expect } from '@playwright/test';

/**
 * Performance profiling tests for outline operations.
 *
 * These tests measure delete and create operations with the current document size.
 *
 * ## For comprehensive large-scale profiling (2000+ nodes):
 *
 * ### Option 1: Tauri Desktop App (recommended for real-world profiling)
 *   1. Run: cd app && npm run tauri dev
 *   2. Open Chrome DevTools (Ctrl+Shift+I) > Performance tab
 *   3. In console: outline._generateTestNodes(2000)
 *   4. Start recording, delete an item (Ctrl+Shift+Backspace), stop recording
 *
 * ### Option 2: Vite Dev Server (for JS-only profiling)
 *   1. Run: cd app && npm run dev
 *   2. Open http://localhost:5173 in Chrome
 *   3. Open DevTools > Console
 *   4. Run: outline._generateTestNodes(2000)
 *   5. Note: Delete won't persist since mock API doesn't know about test nodes
 *   6. Use _measureRender() to test tree building: outline._measureRender()
 *
 * ## Console Logs
 * The console will show [perf] logs for:
 *   - deleteNode: total, api, updateState times
 *   - buildTree: tree construction time (only when >10ms)
 *   - rebuildIndexes: index rebuild time (surgical or full, only when >2ms/5ms)
 */
test.describe('Performance profiling', () => {
  test('profile delete with baseline data', async ({ page }) => {
    // Capture console logs for performance metrics
    const perfLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[perf]')) {
        perfLogs.push(text);
      }
    });

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    // Count initial items
    const initialCount = await page.locator('.outline-item').count();
    console.log(`Initial node count: ${initialCount}`);

    // Create a test item to delete
    await page.locator('.outline-item').first().click();
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Test item for deletion');
    await page.waitForTimeout(100);

    const countAfterCreate = await page.locator('.outline-item').count();
    expect(countAfterCreate).toBe(initialCount + 1);

    // Clear perf logs before measuring delete
    perfLogs.length = 0;

    // Delete the focused item
    await page.keyboard.press('Control+Shift+Backspace');
    await page.waitForTimeout(300);

    // Print performance results
    console.log('\n=== DELETE OPERATION PROFILE ===');
    for (const log of perfLogs) {
      console.log(log);
    }

    // Verify deletion happened
    const countAfterDelete = await page.locator('.outline-item').count();
    expect(countAfterDelete).toBe(initialCount);

    // Parse and display timing breakdown
    const deleteLog = perfLogs.find(l => l.includes('deleteNode:'));
    if (deleteLog) {
      const totalMatch = deleteLog.match(/total=(\d+\.?\d*)ms/);
      const apiMatch = deleteLog.match(/api=(\d+\.?\d*)ms/);
      const updateMatch = deleteLog.match(/updateState=(\d+\.?\d*)ms/);

      if (totalMatch && apiMatch && updateMatch) {
        console.log('\nParsed breakdown:');
        console.log(`  API call:        ${parseFloat(apiMatch[1]).toFixed(1)} ms`);
        console.log(`  updateState:     ${parseFloat(updateMatch[1]).toFixed(1)} ms`);
        console.log(`  Total:           ${parseFloat(totalMatch[1]).toFixed(1)} ms`);
      }
    }

    console.log('=== END PROFILE ===\n');
  });

  test('profile multiple operations for consistency', async ({ page }) => {
    const perfLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[perf]')) {
        perfLogs.push(text);
      }
    });

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    const initialCount = await page.locator('.outline-item').count();
    const deleteTimes: number[] = [];

    // Create 10 items then delete them, measuring each delete
    for (let i = 0; i < 10; i++) {
      // Create
      await page.locator('.outline-item').first().click();
      await page.waitForTimeout(50);
      await page.keyboard.press('Enter');
      await page.keyboard.type(`Test item ${i + 1}`);
      await page.waitForTimeout(50);

      // Delete
      perfLogs.length = 0;
      await page.keyboard.press('Control+Shift+Backspace');
      await page.waitForTimeout(150);

      const deleteLog = perfLogs.find(l => l.includes('deleteNode:'));
      if (deleteLog) {
        const match = deleteLog.match(/total=(\d+\.?\d*)ms/);
        if (match) {
          deleteTimes.push(parseFloat(match[1]));
        }
      }
    }

    console.log('\n=== DELETE CONSISTENCY TEST (10 create/delete cycles) ===');
    console.log(`Delete times: ${deleteTimes.map(t => t.toFixed(1) + 'ms').join(', ')}`);
    if (deleteTimes.length > 0) {
      console.log(`Average: ${(deleteTimes.reduce((a, b) => a + b, 0) / deleteTimes.length).toFixed(1)} ms`);
      console.log(`Min: ${Math.min(...deleteTimes).toFixed(1)} ms`);
      console.log(`Max: ${Math.max(...deleteTimes).toFixed(1)} ms`);
    }
    console.log('=== END CONSISTENCY TEST ===\n');

    // Verify we're back to initial count
    const finalCount = await page.locator('.outline-item').count();
    expect(finalCount).toBe(initialCount);
  });

  test('profile buildTree and rebuildIndexes with synthetic data', async ({ page }) => {
    const perfLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[perf]')) {
        perfLogs.push(text);
        console.log(text);
      }
    });

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    // Generate synthetic test nodes
    console.log('\n=== SYNTHETIC DATA PERFORMANCE TEST ===');
    console.log('Note: Uses _generateTestNodes which bypasses normal update path');
    console.log('Full rebuilds are expected (no surgical updates)');

    for (const count of [100, 500, 1000, 2000]) {
      perfLogs.length = 0;

      // Generate test nodes
      await page.evaluate((c) => {
        (window as any).outline._generateTestNodes(c);
      }, count);
      await page.waitForTimeout(100);

      // Measure tree building
      await page.evaluate(() => {
        (window as any).outline._measureRender();
      });
      await page.waitForTimeout(50);

      // Find the perf logs for this iteration
      const rebuildLog = perfLogs.find(l => l.includes('rebuildIndexes'));

      console.log(`${count} nodes:`);
      if (rebuildLog) console.log(`  ${rebuildLog}`);
    }

    console.log('\n=== END SYNTHETIC TEST ===\n');
  });

  test('profile DOM render time with synthetic data', async ({ page }) => {
    const perfLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[perf]') || text.includes('[render-profile]')) {
        perfLogs.push(text);
        console.log(text);
      }
    });

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    console.log('\n=== DOM RENDER PERFORMANCE TEST ===');
    console.log('Measures time from state change to DOM update complete');

    for (const count of [100, 500, 1000, 1500, 2000]) {
      perfLogs.length = 0;

      // Measure full render cycle: generate nodes -> DOM update
      const renderTime = await page.evaluate(async (c) => {
        const start = performance.now();
        (window as any).outline._generateTestNodes(c);

        // Wait for Svelte to update DOM
        await new Promise(resolve => requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        }));

        const elapsed = performance.now() - start;
        console.log(`[render-profile] ${c} nodes: total render ${elapsed.toFixed(1)}ms`);
        return elapsed;
      }, count);

      // Count actual DOM elements
      const domCount = await page.locator('.outline-item').count();

      console.log(`${count} nodes: render=${renderTime.toFixed(1)}ms, DOM elements=${domCount}`);
    }

    console.log('\n=== END DOM RENDER TEST ===\n');
  });

  test('profile first contentful paint simulation', async ({ page }) => {
    console.log('\n=== FIRST CONTENTFUL PAINT SIMULATION ===');
    console.log('Measures initial page load time with different document sizes');

    // This test simulates what happens when opening a document
    // by measuring page load with pre-seeded data

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    const initialCount = await page.locator('.outline-item').count();
    console.log(`Real document: ${initialCount} nodes`);

    // Measure navigation/focus operations which are common user actions
    const navTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const navTime = await page.evaluate(() => {
        const start = performance.now();
        (window as any).outline.moveToNext();
        return performance.now() - start;
      });
      navTimes.push(navTime);
    }

    console.log(`Navigation times: ${navTimes.map(t => t.toFixed(2) + 'ms').join(', ')}`);
    console.log(`Average navigation: ${(navTimes.reduce((a, b) => a + b, 0) / navTimes.length).toFixed(2)}ms`);

    console.log('\n=== END FCP TEST ===\n');
  });

  test('profile TipTap editor creation overhead', async ({ page }) => {
    const perfLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[tiptap-profile]')) {
        perfLogs.push(text);
        console.log(text);
      }
    });

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    console.log('\n=== TIPTAP EDITOR CREATION OVERHEAD ===');
    console.log('Measures time to create TipTap editor when focusing items');

    // Click on different items and measure editor creation
    const items = page.locator('.outline-item');
    const itemCount = await items.count();
    const sampleSize = Math.min(10, itemCount);

    const creationTimes: number[] = [];
    for (let i = 0; i < sampleSize; i++) {
      // First unfocus by clicking elsewhere
      await page.locator('body').click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(50);

      // Time the focus operation - click on item-row to focus it
      const startTime = await page.evaluate(() => performance.now());
      await items.nth(i).locator('.item-row').first().click();
      await page.waitForTimeout(100); // Wait for editor to initialize

      const elapsed = await page.evaluate((start) => {
        return performance.now() - start;
      }, startTime);

      creationTimes.push(elapsed);
    }

    console.log(`Editor creation times: ${creationTimes.map(t => t.toFixed(1) + 'ms').join(', ')}`);
    console.log(`Average: ${(creationTimes.reduce((a, b) => a + b, 0) / creationTimes.length).toFixed(1)}ms`);
    console.log(`Note: Includes click handling + TipTap init + focus`);

    console.log('\n=== END TIPTAP OVERHEAD TEST ===\n');
  });

  test('measure viewport utilization and virtualization potential', async ({ page }) => {
    console.log('\n=== VIEWPORT UTILIZATION & VIRTUALIZATION POTENTIAL ===');

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    // Generate a decent number of items
    await page.evaluate(() => {
      (window as any).outline._generateTestNodes(500);
    });
    await page.waitForTimeout(200);

    // Get viewport and content dimensions
    const metrics = await page.evaluate(() => {
      const contentArea = document.querySelector('.content-area') as HTMLElement;
      const items = document.querySelectorAll('.outline-item');
      const viewportHeight = contentArea?.clientHeight || window.innerHeight;
      const scrollHeight = contentArea?.scrollHeight || document.body.scrollHeight;

      // Count items in viewport
      let visibleCount = 0;
      let totalHeight = 0;
      const itemHeights: number[] = [];

      items.forEach((item) => {
        const rect = (item as HTMLElement).getBoundingClientRect();
        const itemHeight = rect.height;
        itemHeights.push(itemHeight);
        totalHeight += itemHeight;

        // Check if item is in viewport
        if (rect.top < viewportHeight && rect.bottom > 0) {
          visibleCount++;
        }
      });

      const avgHeight = itemHeights.length > 0
        ? itemHeights.reduce((a, b) => a + b, 0) / itemHeights.length
        : 0;

      return {
        totalItems: items.length,
        visibleItems: visibleCount,
        viewportHeight,
        scrollHeight,
        avgItemHeight: avgHeight,
        minItemHeight: Math.min(...itemHeights),
        maxItemHeight: Math.max(...itemHeights),
      };
    });

    console.log(`Total items: ${metrics.totalItems}`);
    console.log(`Visible in viewport: ${metrics.visibleItems}`);
    console.log(`Viewport height: ${metrics.viewportHeight}px`);
    console.log(`Total scroll height: ${metrics.scrollHeight}px`);
    console.log(`Average item height: ${metrics.avgItemHeight.toFixed(1)}px`);
    console.log(`Item height range: ${metrics.minItemHeight.toFixed(0)}-${metrics.maxItemHeight.toFixed(0)}px`);

    const renderEfficiency = (metrics.visibleItems / metrics.totalItems) * 100;
    console.log(`\nRender efficiency: ${renderEfficiency.toFixed(2)}%`);
    console.log(`Potential speedup from virtualization: ${(100 / renderEfficiency).toFixed(1)}x`);

    // Estimate memory savings
    const domNodesPerItem = 15; // Rough estimate of DOM nodes per outline item
    const totalDomNodes = metrics.totalItems * domNodesPerItem;
    const virtualizedDomNodes = (metrics.visibleItems + 10) * domNodesPerItem; // +10 for buffer
    console.log(`\nEstimated DOM nodes (current): ${totalDomNodes}`);
    console.log(`Estimated DOM nodes (virtualized): ${virtualizedDomNodes}`);
    console.log(`DOM node reduction: ${((1 - virtualizedDomNodes / totalDomNodes) * 100).toFixed(1)}%`);

    console.log('\n=== END VIEWPORT UTILIZATION TEST ===\n');
  });

  test('profile scroll performance with large dataset', async ({ page }) => {
    console.log('\n=== SCROLL PERFORMANCE TEST ===');

    await page.goto('/');
    await page.waitForSelector('.outline-item');

    // Generate larger dataset
    await page.evaluate(() => {
      (window as any).outline._generateTestNodes(1000);
    });
    await page.waitForTimeout(500);

    const contentArea = page.locator('.content-area');

    // Measure scroll performance
    const scrollTimes: number[] = [];
    const scrollDistances = [500, 1000, 2000, 5000];

    for (const distance of scrollDistances) {
      // Reset scroll position
      await contentArea.evaluate((el) => el.scrollTop = 0);
      await page.waitForTimeout(100);

      // Measure scroll
      const scrollTime = await contentArea.evaluate(async (el, dist) => {
        const start = performance.now();
        el.scrollBy({ top: dist, behavior: 'instant' });

        // Wait for render
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return performance.now() - start;
      }, distance);

      scrollTimes.push(scrollTime);
      console.log(`Scroll ${distance}px: ${scrollTime.toFixed(1)}ms`);
    }

    console.log(`\nAverage scroll time: ${(scrollTimes.reduce((a, b) => a + b, 0) / scrollTimes.length).toFixed(1)}ms`);

    console.log('\n=== END SCROLL PERFORMANCE TEST ===\n');
  });
});
