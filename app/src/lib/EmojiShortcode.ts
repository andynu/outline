import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import _EMOJI_MAP from './emoji-map.json';
import { resolveCustomEmoji } from '../store/customEmojiStore';

const EMOJI_MAP: Record<string, string> = _EMOJI_MAP;

/**
 * TipTap extension that converts emoji shortcodes like :smile: into UTF-8 emoji.
 *
 * Uses a ProseMirror plugin that listens for text input. When the user types
 * a closing `:`, it looks backwards for a matching opening `:` and checks
 * if the text between them is a known shortcode. If so, the `:shortcode:` text
 * is replaced with the corresponding emoji character.
 *
 * Supports both built-in Unicode emoji and custom emoji (text or image).
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

            // Calculate the absolute position of the opening `:`
            const startOfParent = from - $from.parentOffset;
            const absoluteStart = startOfParent + lastColonIndex;

            // First, check built-in emoji map
            const emoji = EMOJI_MAP[shortcode.toLowerCase()];
            if (emoji) {
              const tr = state.tr.replaceWith(
                absoluteStart,
                to,
                state.schema.text(emoji)
              );
              view.dispatch(tr);
              return true;
            }

            // Then, check custom emoji
            const custom = resolveCustomEmoji(shortcode.toLowerCase());
            if (!custom) {
              return false;
            }

            if (custom.type === 'text') {
              // Text-based custom emoji: insert as plain text
              const tr = state.tr.replaceWith(
                absoluteStart,
                to,
                state.schema.text(custom.content)
              );
              view.dispatch(tr);
              return true;
            }

            if (custom.type === 'image') {
              // Image-based custom emoji: insert as a customEmoji node
              const nodeType = state.schema.nodes.customEmoji;
              if (nodeType) {
                const emojiNode = nodeType.create({
                  src: custom.url,
                  alt: `:${custom.shortcode}:`,
                  shortcode: custom.shortcode,
                });
                const tr = state.tr.replaceWith(absoluteStart, to, emojiNode);
                view.dispatch(tr);
                return true;
              }
              return false;
            }

            return false;
          },
        },
      }),
    ];
  },
});
