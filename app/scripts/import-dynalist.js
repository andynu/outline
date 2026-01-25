#!/usr/bin/env node
/**
 * Import latest Dynalist OPML backup into Outline
 *
 * Run this while the Tauri app is open, then paste the command in DevTools console.
 *
 * Usage: node scripts/import-dynalist.js [folder-name]
 */

const folderName = process.argv[2] || 'Dynalist';

console.log(`
=== Import Dynalist Backup ===

Paste this in the browser DevTools console (F12) while the app is running:

  import('$lib/api').then(api =>
    api.importLatestDynalistBackup('${folderName}')
  ).then(r => {
    console.log('Imported', r.length, 'documents');
    location.reload();
  });

Or in a Svelte component:

  import { importLatestDynalistBackup } from '$lib/api';
  const results = await importLatestDynalistBackup('${folderName}');

Folder: "${folderName}" (will be created or reused if exists)
`);
