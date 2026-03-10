#!/usr/bin/env node
/**
 * Generates src/lib/emoji-map.json from emojibase-data.
 *
 * Maps every shortcode (including aliases) to its native emoji character.
 * Run: node scripts/generate-emoji-map.js
 */
const fs = require('fs');
const path = require('path');

const data = require('emojibase-data/en/data.json');
const shortcodes = require('emojibase-data/en/shortcodes/emojibase.json');

// Build hexcode -> emoji lookup
const hexToEmoji = {};
for (const entry of data) {
  hexToEmoji[entry.hexcode] = entry.emoji;
  // Also index skin tone variants
  if (entry.skins) {
    for (const skin of entry.skins) {
      hexToEmoji[skin.hexcode] = skin.emoji;
    }
  }
}

// Build shortcode -> emoji map
const map = {};
let count = 0;

for (const [hexcode, codes] of Object.entries(shortcodes)) {
  const emoji = hexToEmoji[hexcode];
  if (!emoji) continue;

  const arr = Array.isArray(codes) ? codes : [codes];
  for (const code of arr) {
    // Skip skin tone shortcodes (e.g., "wave_tone1") to keep size manageable
    // They're still accessible via the base shortcode
    if (/_tone\d/.test(code)) continue;

    map[code] = emoji;
    count++;
  }
}

const outPath = path.join(__dirname, '..', 'src', 'lib', 'emoji-map.json');
fs.writeFileSync(outPath, JSON.stringify(map, null, 0));

const sizeKB = (Buffer.byteLength(JSON.stringify(map)) / 1024).toFixed(1);
console.log(`Generated ${outPath}`);
console.log(`  ${count} shortcodes -> emoji mappings (${sizeKB} KB)`);
