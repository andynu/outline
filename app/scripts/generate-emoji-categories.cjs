#!/usr/bin/env node
/**
 * Generates categorized emoji data from emojibase-data.
 * Output: app/src/lib/emoji-categories.json
 */
const data = require('../node_modules/emojibase-data/en/data.json');
const shortcodes = require('../node_modules/emojibase-data/en/shortcodes/emojibase.json');
const fs = require('fs');
const path = require('path');

const GROUP_NAMES = {
  0: 'Smileys & Emotion',
  1: 'People & Body',
  3: 'Animals & Nature',
  4: 'Food & Drink',
  5: 'Travel & Places',
  6: 'Activities',
  7: 'Objects',
  8: 'Symbols',
  9: 'Flags'
};

// Group order for the picker
const GROUP_ORDER = [
  'Smileys & Emotion',
  'People & Body',
  'Animals & Nature',
  'Food & Drink',
  'Travel & Places',
  'Activities',
  'Objects',
  'Symbols',
  'Flags'
];

const categories = {};

data.forEach(function(item) {
  // Skip components (skin tones etc) and items without a group
  if (item.group == null || item.group === 2) return;
  const groupName = GROUP_NAMES[item.group];
  if (!groupName) return;
  if (!categories[groupName]) categories[groupName] = [];

  const sc = shortcodes[item.hexcode];
  let scArray = [];
  if (sc) {
    scArray = Array.isArray(sc) ? sc : [sc];
  }
  if (scArray.length === 0) return;

  categories[groupName].push({
    e: item.emoji,
    s: scArray,
    order: item.order || 0
  });
});

// Sort each category by order, then strip the order field
const result = GROUP_ORDER.map(function(name) {
  const emojis = (categories[name] || [])
    .sort(function(a, b) { return a.order - b.order; })
    .map(function(item) { return { e: item.e, s: item.s }; });
  return { name: name, emoji: emojis };
});

const outputPath = path.join(__dirname, '..', 'src', 'lib', 'emoji-categories.json');
fs.writeFileSync(outputPath, JSON.stringify(result));

// Print stats
let total = 0;
result.forEach(function(cat) {
  console.log(cat.name + ': ' + cat.emoji.length);
  total += cat.emoji.length;
});
console.log('Total: ' + total);
console.log('Written to ' + outputPath);
