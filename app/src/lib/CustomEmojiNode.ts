import { Node, mergeAttributes } from '@tiptap/core';

/**
 * TipTap inline node for custom image emoji.
 *
 * Renders as an <img> tag with class="custom-emoji". The image is sized
 * to match the line height (~20px) and displayed inline with text.
 *
 * Attributes:
 * - src: The asset protocol URL for the emoji image
 * - alt: The :shortcode: text (for copy/paste and accessibility)
 * - shortcode: The emoji shortcode (without colons)
 */
export const CustomEmojiNode = Node.create({
  name: 'customEmoji',

  group: 'inline',
  inline: true,
  atom: true, // Cannot be edited directly, treated as a single unit

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      shortcode: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img.custom-emoji',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        class: 'custom-emoji',
        draggable: 'false',
      }),
    ];
  },
});
