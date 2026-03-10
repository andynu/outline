import React, { memo, useRef, useEffect, useCallback, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { useOutlineStore } from '../store/outlineStore';
import type { Node } from '../lib/types';

// TipTap extensions
import { Hashtag } from '../lib/Hashtag';
import { Mention } from '../lib/Mention';
import { EmojiShortcode } from '../lib/EmojiShortcode';
import { CustomEmojiNode } from '../lib/CustomEmojiNode';

// Suggestion popups
import { HashtagSuggestion } from './ui/HashtagSuggestion';
import { EmojiSuggestion } from './ui/EmojiSuggestion';

export interface DocumentTitleRef {
  focus: () => void;
}

interface DocumentTitleProps {
  node: Node;
  onNavigateToNode?: (nodeId: string) => void;
  onTitleChange?: () => void;
}

export const DocumentTitle = memo(forwardRef<DocumentTitleRef, DocumentTitleProps>(
  function DocumentTitle({ node, onNavigateToNode, onTitleChange }, ref) {
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Editor | null>(null);
    const titleChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Hashtag suggestion state
    const [showHashtagSuggestion, setShowHashtagSuggestion] = useState(false);
    const [hashtagQuery, setHashtagQuery] = useState('');
    const [hashtagRange, setHashtagRange] = useState<{ from: number; to: number } | null>(null);
    const [hashtagPosition, setHashtagPosition] = useState({ x: 0, y: 0 });
    const hashtagActiveRef = useRef(false);
    const hashtagRangeRef = useRef<{ from: number; to: number } | null>(null);

    // Emoji suggestion state
    const [showEmojiSuggestion, setShowEmojiSuggestion] = useState(false);
    const [emojiQuery, setEmojiQuery] = useState('');
    const [emojiRange, setEmojiRange] = useState<{ from: number; to: number } | null>(null);
    const [emojiPosition, setEmojiPosition] = useState({ x: 0, y: 0 });
    const emojiActiveRef = useRef(false);
    const emojiRangeRef = useRef<{ from: number; to: number } | null>(null);

    // Existing tags for suggestions
    const existingTags = useMemo(() => {
      const tagMap = new Map<string, { count: number }>();
      const HASHTAG_PATTERN = /(?:^|[\s])#([a-zA-Z][a-zA-Z0-9_-]*)/g;
      const nodes = useOutlineStore.getState().nodes;
      for (const n of nodes) {
        const plainText = n.content.replace(/<[^>]*>/g, '');
        for (const match of plainText.matchAll(HASHTAG_PATTERN)) {
          const tag = match[1];
          const existing = tagMap.get(tag);
          if (existing) {
            existing.count++;
          } else {
            tagMap.set(tag, { count: 1 });
          }
        }
      }
      return tagMap;
    }, []);

    // Title focus request from store
    const titleFocusRequested = useOutlineStore(state => state.titleFocusRequested);

    useEffect(() => {
      if (titleFocusRequested && editorRef.current) {
        editorRef.current.commands.focus('end');
        useOutlineStore.getState().clearTitleFocusRequest();
      }
    }, [titleFocusRequested]);

    // Expose focus method via ref
    useImperativeHandle(ref, () => ({
      focus: () => {
        editorRef.current?.commands.focus('end');
      },
    }), []);

    // Create editor on mount
    useEffect(() => {
      if (!editorContainerRef.current) return;

      const nodeId = node.id;

      const editor = new Editor({
        element: editorContainerRef.current,
        extensions: [
          StarterKit.configure({
            heading: false,
            bulletList: false,
            orderedList: false,
            blockquote: false,
            codeBlock: false,
            horizontalRule: false,
            hardBreak: false,
          }),
          Hashtag.configure({
            onHashtagClick: (tag: string) => {
              useOutlineStore.getState().setFilterQuery(`#${tag}`);
            },
          }),
          Mention.configure({
            onMentionClick: (mention: string) => {
              useOutlineStore.getState().setFilterQuery(`@${mention}`);
            },
          }),
          EmojiShortcode,
          CustomEmojiNode,
        ],
        content: node.content || '',
        editorProps: {
          attributes: {
            class: 'document-title-editor-inner',
          },
          handleTextInput: (view, from, to, text) => {
            const state = view.state;
            const prevChar = from > 0 ? state.doc.textBetween(from - 1, from) : '';

            // Detect # trigger for hashtags
            if (text === '#' && (prevChar === '' || prevChar === ' ' || prevChar === '\t' || from === 1)) {
              const coords = view.coordsAtPos(from);
              hashtagActiveRef.current = true;
              hashtagRangeRef.current = { from, to: from + 1 };
              setShowHashtagSuggestion(true);
              setHashtagQuery('');
              setHashtagRange({ from, to: from + 1 });
              setHashtagPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            // Update hashtag query
            if (hashtagActiveRef.current && hashtagRangeRef.current) {
              const range = hashtagRangeRef.current;
              const queryStart = range.from + 1;
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              if (text === ' ' || text === '\t' || text === '\n') {
                hashtagActiveRef.current = false;
                hashtagRangeRef.current = null;
                setShowHashtagSuggestion(false);
                setHashtagRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              hashtagRangeRef.current = newRange;
              setHashtagQuery(currentQuery);
              setHashtagRange(newRange);
              return false;
            }

            // Detect : trigger for emoji shortcodes
            if (text === ':' && !emojiActiveRef.current &&
                (prevChar === '' || prevChar === ' ' || prevChar === '\t' || from === 1)) {
              const coords = view.coordsAtPos(from);
              emojiActiveRef.current = true;
              emojiRangeRef.current = { from, to: from + 1 };
              setShowEmojiSuggestion(true);
              setEmojiQuery('');
              setEmojiRange({ from, to: from + 1 });
              setEmojiPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            // Update emoji query
            if (emojiActiveRef.current && emojiRangeRef.current) {
              const range = emojiRangeRef.current;
              const queryStart = range.from + 1;
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              if (text === ' ' || text === '\t' || text === '\n' || text === ':') {
                emojiActiveRef.current = false;
                emojiRangeRef.current = null;
                setShowEmojiSuggestion(false);
                setEmojiRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              emojiRangeRef.current = newRange;
              setEmojiQuery(currentQuery);
              setEmojiRange(newRange);
              return false;
            }

            return false;
          },
          handleKeyDown: (_view, event) => {
            // Let suggestion popups handle their keys
            if (hashtagActiveRef.current || emojiActiveRef.current) {
              if (event.key === 'Enter' || event.key === 'Tab' ||
                  event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                return false;
              }
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              // Save content, then focus first child in tree
              const store = useOutlineStore.getState();
              const children = store.childrenOf(nodeId);
              if (children.length > 0) {
                // Focus first child
                store.setFocusedId(children[0].id);
              } else {
                // Create a new child
                store.addSiblingAfter(nodeId);
              }
              return true;
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault();
              const store = useOutlineStore.getState();
              store.moveToFirst();
              return true;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              editorRef.current?.commands.blur();
              return true;
            }

            return false;
          },
        },
        onUpdate: ({ editor }) => {
          useOutlineStore.getState().updateContent(nodeId, editor.getHTML());
          // Debounced sidebar refresh so document title stays in sync
          if (titleChangeTimerRef.current) clearTimeout(titleChangeTimerRef.current);
          titleChangeTimerRef.current = setTimeout(() => onTitleChange?.(), 500);
        },
      });

      editorRef.current = editor;

      return () => {
        editor.destroy();
        editorRef.current = null;
      };
    }, [node.id]); // Only recreate when node ID changes (document switch)

    // Update editor content when node content changes externally
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;

      const currentHTML = editor.getHTML();
      if (currentHTML !== node.content && !editor.isFocused) {
        editor.commands.setContent(node.content || '', false);
      }
    }, [node.content]);

    // Hashtag select/close handlers
    const handleHashtagSelect = useCallback((tag: string) => {
      const editor = editorRef.current;
      const range = hashtagRangeRef.current;
      if (!editor || !range) return;

      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent(`#${tag} `)
        .run();

      hashtagActiveRef.current = false;
      hashtagRangeRef.current = null;
      setShowHashtagSuggestion(false);
      setHashtagRange(null);
    }, []);

    const handleHashtagClose = useCallback(() => {
      hashtagActiveRef.current = false;
      hashtagRangeRef.current = null;
      setShowHashtagSuggestion(false);
      setHashtagRange(null);
    }, []);

    // Emoji select/close handlers
    const handleEmojiSelect = useCallback((shortcode: string, emoji: string, imageUrl?: string) => {
      const editor = editorRef.current;
      const range = emojiRangeRef.current;
      if (!editor || !range) return;

      if (imageUrl) {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: 'customEmoji',
            attrs: {
              src: imageUrl,
              alt: `:${shortcode}:`,
              shortcode: shortcode,
            },
          })
          .run();
      } else {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent(emoji)
          .run();
      }

      emojiActiveRef.current = false;
      emojiRangeRef.current = null;
      setShowEmojiSuggestion(false);
      setEmojiRange(null);
    }, []);

    const handleEmojiClose = useCallback(() => {
      emojiActiveRef.current = false;
      emojiRangeRef.current = null;
      setShowEmojiSuggestion(false);
      setEmojiRange(null);
    }, []);

    return (
      <div className="document-title-header">
        <div className="document-title-editor" ref={editorContainerRef} />

        {showHashtagSuggestion && (
          <HashtagSuggestion
            query={hashtagQuery}
            position={hashtagPosition}
            onSelect={handleHashtagSelect}
            onClose={handleHashtagClose}
            existingTags={existingTags}
          />
        )}

        {showEmojiSuggestion && (
          <EmojiSuggestion
            query={emojiQuery}
            position={emojiPosition}
            onSelect={handleEmojiSelect}
            onClose={handleEmojiClose}
          />
        )}
      </div>
    );
  }
));
