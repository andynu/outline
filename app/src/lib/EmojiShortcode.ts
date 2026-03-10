import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import _EMOJI_MAP from './emoji-map.json';

const EMOJI_MAP: Record<string, string> = _EMOJI_MAP;

/**
 * TipTap extension that converts emoji shortcodes like :smile: into UTF-8 emoji.
 *
 * Uses a ProseMirror plugin that listens for text input. When the user types
 * a closing `:`, it looks backwards for a matching opening `:` and checks
 * if the text between them is a known shortcode. If so, the `:shortcode:` text
 * is replaced with the corresponding emoji character.
 *
 * Unrecognized shortcodes are left as-is.
 */
export const EmojiShortcode = Extension.create({
  name: 'emojiShortcode',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('emojiShortcode'),
        props: {
          handleTextInput(view, from, to, text) {
            // Only act when the user types a closing `:`
            if (text !== ':') {
              return false;
            }

            const { state } = view;
            const { doc } = state;

            // Get the text node containing the cursor position
            const $from = doc.resolve(from);
            const textBefore = $from.parent.textBetween(
              0,
              $from.parentOffset,
              undefined,
              '\uFFFC'
            );

            // Find the last `:` in the text before the cursor
            const lastColonIndex = textBefore.lastIndexOf(':');
            if (lastColonIndex === -1) {
              return false;
            }

            // Extract the shortcode between the colons
            const shortcode = textBefore.slice(lastColonIndex + 1);

            // Validate: shortcode must be non-empty and contain only valid characters
            // (letters, digits, underscores, hyphens, plus signs)
            if (!shortcode || !/^[a-zA-Z0-9_+\-]+$/.test(shortcode)) {
              return false;
            }

            // Look up the emoji
            const emoji = EMOJI_MAP[shortcode.toLowerCase()];
            if (!emoji) {
              return false;
            }

            // Calculate the absolute position of the opening `:`
            // parentOffset tells us where `from` is within the parent node,
            // and we know `textBefore` ends at parentOffset
            const startOfParent = from - $from.parentOffset;
            const absoluteStart = startOfParent + lastColonIndex;

            // Replace `:shortcode:` (including the closing `:` being typed) with the emoji
            const tr = state.tr.replaceWith(
              absoluteStart,
              to,
              state.schema.text(emoji)
            );
            view.dispatch(tr);

            return true;
          },
        },
      }),
    ];
  },
});
