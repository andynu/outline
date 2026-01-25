#!/usr/bin/env node
/**
 * Import latest Dynalist OPML backup into Outline
 *
 * Usage: ./import-dynalist.js [folder-name]
 *
 * Finds the most recent dynalist-backup-opml-*.zip and imports all OPML files
 * directly into ~/.outline-data/documents/
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';

const BACKUP_DIR = join(homedir(), 'Dropbox/Apps/Dynalist/backups');
const DATA_DIR = join(homedir(), '.outline-data');
const DOCS_DIR = join(DATA_DIR, 'documents');
const FOLDERS_FILE = join(DATA_DIR, 'folders.json');

function findLatestBackup() {
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('dynalist-backup-opml-') && f.endsWith('.zip'))
    .map(f => ({
      name: f,
      path: join(BACKUP_DIR, f),
      mtime: statSync(join(BACKUP_DIR, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    throw new Error(`No OPML backups found in ${BACKUP_DIR}`);
  }

  return files[0];
}

function loadFolders() {
  if (!existsSync(FOLDERS_FILE)) {
    return { folders: [], document_folders: {}, document_order: {} };
  }
  return JSON.parse(readFileSync(FOLDERS_FILE, 'utf8'));
}

function saveFolders(state) {
  writeFileSync(FOLDERS_FILE, JSON.stringify(state, null, 2));
}

function getOrCreateFolder(name) {
  const state = loadFolders();

  // Check if folder exists
  let folder = state.folders.find(f => f.name === name);
  if (folder) {
    return { folder, state };
  }

  // Create new folder
  const position = Math.max(-1, ...state.folders.map(f => f.position)) + 1;
  folder = {
    id: randomUUID(),
    name,
    position,
    collapsed: false
  };
  state.folders.push(folder);
  saveFolders(state);

  return { folder, state };
}

function parseOpml(content) {
  const nodes = [];

  // Extract title from head
  const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : null;

  function decodeEntities(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
  }

  function parseAttributes(attrStr) {
    const attrs = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let match;
    while ((match = attrRegex.exec(attrStr)) !== null) {
      attrs[match[1]] = decodeEntities(match[2]);
    }
    return attrs;
  }

  // Recursive parser using a stack-based approach
  function parseBody(xml) {
    const stack = [{ id: null, children: [] }]; // Root level
    let pos = 0;

    while (pos < xml.length) {
      // Find next outline tag
      const openMatch = xml.slice(pos).match(/<outline\s+([^>]*?)(\/?)>/);
      const closeMatch = xml.slice(pos).match(/<\/outline>/);

      if (!openMatch && !closeMatch) break;

      const openIndex = openMatch ? pos + openMatch.index : Infinity;
      const closeIndex = closeMatch ? pos + closeMatch.index : Infinity;

      if (openIndex < closeIndex) {
        // Opening tag
        const attrs = parseAttributes(openMatch[1]);
        const isSelfClosing = openMatch[2] === '/';
        const text = attrs.text || '';

        if (text.trim() || attrs._note) {
          const parentId = stack[stack.length - 1].id;
          const position = stack[stack.length - 1].children.length;
          const nodeId = randomUUID();
          const now = new Date().toISOString();

          // Determine node type
          let nodeType = 'bullet';
          let isChecked = false;
          if (attrs.complete === 'true') {
            nodeType = 'checkbox';
            isChecked = true;
          }

          // Map Dynalist colors
          const colorMap = { '1': 'red', '2': 'orange', '3': 'yellow', '4': 'green', '5': 'blue', '6': 'purple' };
          const color = colorMap[attrs.colorLabel] || undefined;

          // Parse date from !(YYYY-MM-DD) syntax
          let date = undefined;
          let dateRecurrence = undefined;
          const dateMatch = text.match(/!\((\d{4}-\d{2}-\d{2})(?:\s*\|\s*([^)]+))?\)/);
          if (dateMatch) {
            date = dateMatch[1];
            if (dateMatch[2]) {
              const rec = dateMatch[2].trim().replace(/^~/, '');
              const recMatch = rec.match(/^(\d+)([dwmy])$/);
              if (recMatch) {
                const interval = parseInt(recMatch[1]);
                const freq = { d: 'DAILY', w: 'WEEKLY', m: 'MONTHLY', y: 'YEARLY' }[recMatch[2]];
                dateRecurrence = interval === 1 ? `FREQ=${freq}` : `FREQ=${freq};INTERVAL=${interval}`;
              }
            }
          }

          // Clean text (remove date syntax)
          let cleanText = text.replace(/!\([^)]+\)\s*/g, '').trim();
          // Convert ==highlight== to <mark>
          cleanText = cleanText.replace(/==([^=]+)==/g, '<mark>$1</mark>');

          const node = {
            id: nodeId,
            position,
            content: `<p>${cleanText}</p>`,
            node_type: nodeType,
            is_checked: isChecked,
            collapsed: false,
            created_at: now,
            updated_at: now
          };

          if (parentId) node.parent_id = parentId;
          if (attrs._note) node.note = attrs._note;
          if (color) node.color = color;
          if (date) node.date = date;
          if (dateRecurrence) node.date_recurrence = dateRecurrence;

          nodes.push(node);
          stack[stack.length - 1].children.push(nodeId);

          if (!isSelfClosing) {
            stack.push({ id: nodeId, children: [] });
          }
        } else if (!isSelfClosing) {
          // Empty non-self-closing tag, still need to track nesting
          stack.push({ id: null, children: [] });
        }

        pos = openIndex + openMatch[0].length;
      } else {
        // Closing tag
        if (stack.length > 1) {
          stack.pop();
        }
        pos = closeIndex + 10; // length of </outline>
      }
    }
  }

  // Find body content
  const bodyMatch = content.match(/<body>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    parseBody(bodyMatch[1]);
  }

  return { title, nodes };
}

function createDocument(nodes, folderId, folderState) {
  const docId = randomUUID();
  const docDir = join(DOCS_DIR, docId);

  mkdirSync(docDir, { recursive: true });

  // Write state.json
  writeFileSync(join(docDir, 'state.json'), JSON.stringify({ nodes }, null, 2));

  // Update folder assignment
  if (folderId) {
    folderState.document_folders[docId] = folderId;
    if (!folderState.document_order[folderId]) {
      folderState.document_order[folderId] = [];
    }
    folderState.document_order[folderId].push(docId);
  }

  return docId;
}

async function main() {
  const folderName = process.argv[2] || 'Dynalist';

  console.log('Finding latest Dynalist OPML backup...');
  const backup = findLatestBackup();
  console.log(`Found: ${backup.name}`);

  // Extract zip to temp directory
  const tempDir = `/tmp/dynalist-import-${Date.now()}`;
  mkdirSync(tempDir, { recursive: true });

  console.log('Extracting...');
  execFileSync('unzip', ['-q', '-o', backup.path, '-d', tempDir]);

  // Ensure data directories exist
  mkdirSync(DOCS_DIR, { recursive: true });

  // Get or create folder
  console.log(`Using folder: "${folderName}"`);
  let { folder, state: folderState } = getOrCreateFolder(folderName);

  // Find all OPML files (including in subdirectories)
  function findOpmlFiles(dir) {
    const results = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findOpmlFiles(fullPath));
      } else if (entry.name.toLowerCase().endsWith('.opml')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const opmlFiles = findOpmlFiles(tempDir);
  console.log(`Found ${opmlFiles.length} OPML files\n`);

  let imported = 0;
  for (const filePath of opmlFiles) {
    const content = readFileSync(filePath, 'utf8');
    const relPath = filePath.replace(tempDir + '/', '');

    try {
      const { title, nodes } = parseOpml(content);
      if (nodes.length === 0) {
        console.log(`  - ${relPath} (empty, skipped)`);
        continue;
      }

      const docTitle = title || basename(filePath, '.opml');
      createDocument(nodes, folder.id, folderState);

      console.log(`  ✓ ${docTitle} (${nodes.length} items)`);
      imported++;
    } catch (err) {
      console.log(`  ✗ ${relPath}: ${err.message}`);
    }
  }

  // Save updated folder state
  saveFolders(folderState);

  // Cleanup
  rmSync(tempDir, { recursive: true, force: true });

  console.log(`\n✓ Imported ${imported} documents into "${folderName}" folder`);
  console.log('  Restart the app to see changes.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
