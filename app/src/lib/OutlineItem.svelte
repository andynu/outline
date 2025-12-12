<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { Plugin, PluginKey } from '@tiptap/pm/state';
  import { outline } from './outline.svelte';
  import type { TreeNode } from './types';
  import OutlineItem from './OutlineItem.svelte';
  import { WikiLink } from './WikiLink';
  import WikiLinkSuggestion from './WikiLinkSuggestion.svelte';
  import BacklinksPanel from './BacklinksPanel.svelte';

  interface Props {
    item: TreeNode;
    onNavigateToNode?: (nodeId: string) => void;
  }

  let { item, onNavigateToNode }: Props = $props();

  let editor: Editor | undefined = $state();
  let editorElement: HTMLDivElement | undefined = $state();
  let tabHandler: ((e: KeyboardEvent) => void) | undefined;

  // Wiki link suggestion state
  let showWikiLinkSuggestion = $state(false);
  let wikiLinkQuery = $state('');
  let wikiLinkRange = $state<{ from: number; to: number } | null>(null);
  let suggestionPosition = $state({ x: 0, y: 0 });

  // Reactive checks
  let isFocused = $derived(outline.focusedId === item.node.id);

  // Sync content from store to editor when it changes externally
  $effect(() => {
    if (editor && !editor.isFocused) {
      const currentContent = editor.getHTML();
      if (currentContent !== item.node.content) {
        editor.commands.setContent(item.node.content || '');
      }
    }
  });

  // Focus editor when this node becomes focused
  $effect(() => {
    if (isFocused && editor) {
      // Small delay to ensure editor is ready
      setTimeout(() => {
        editor?.commands.focus('end');
      }, 0);
    }
  });

  onMount(() => {
    if (!editorElement) return;

    // Capture Tab before browser focus navigation - must use capture phase
    tabHandler = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          outline.outdentNode(item.node.id);
        } else {
          outline.indentNode(item.node.id);
        }
      }
    };
    editorElement.addEventListener('keydown', tabHandler, { capture: true });

    // Create plugin for [[ detection
    const wikiLinkInputPlugin = new Plugin({
      key: new PluginKey('wikiLinkInput'),
      props: {
        handleTextInput: (view, from, to, text) => {
          const state = view.state;
          const prevChar = from > 0 ? state.doc.textBetween(from - 1, from) : '';

          // Detect [[ trigger
          if (text === '[' && prevChar === '[') {
            showWikiLinkSuggestion = true;
            wikiLinkQuery = '';
            wikiLinkRange = { from: from - 1, to: from + 1 };
            updateSuggestionPosition(view);
            return false;
          }

          // If suggestion is active, update query
          if (showWikiLinkSuggestion && wikiLinkRange) {
            // Calculate current query
            const queryStart = wikiLinkRange.from + 2;
            const currentQuery = state.doc.textBetween(queryStart, from) + text;

            // Check for ]] to close
            if (text === ']' && currentQuery.endsWith(']')) {
              showWikiLinkSuggestion = false;
              wikiLinkRange = null;
              return false;
            }

            wikiLinkQuery = currentQuery;
            wikiLinkRange = { ...wikiLinkRange, to: from + text.length + 1 };
          }

          return false;
        },
      },
    });

    function updateSuggestionPosition(view: any) {
      const coords = view.coordsAtPos(view.state.selection.from);
      suggestionPosition = {
        x: coords.left,
        y: coords.bottom + 5,
      };
    }

    editor = new Editor({
      element: editorElement,
      extensions: [
        StarterKit.configure({
          // Disable multi-line features for single-line items
          heading: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          hardBreak: false
        }),
        WikiLink.configure({
          onNavigate: (nodeId: string) => {
            if (onNavigateToNode) {
              onNavigateToNode(nodeId);
            } else {
              outline.focus(nodeId);
            }
          },
        }),
      ],
      content: item.node.content || '',
      editorProps: {
        attributes: {
          class: 'outline-editor'
        },
        handleKeyDown: (view, event) => {
          // Handle wiki link suggestion navigation
          if (showWikiLinkSuggestion) {
            if (event.key === 'Escape') {
              showWikiLinkSuggestion = false;
              wikiLinkRange = null;
              return true;
            }
            // Let ArrowUp/Down/Enter/Tab pass to suggestion component
            if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(event.key)) {
              return false; // Let window handler catch it
            }
          }
          const mod = event.ctrlKey || event.metaKey;
          const nodeId = item.node.id;

          // === EDITING ===

          // Enter: add sibling below
          if (event.key === 'Enter' && !mod && !event.shiftKey) {
            event.preventDefault();
            outline.addSiblingAfter(nodeId);
            return true;
          }

          // Tab: indent
          if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            outline.indentNode(nodeId);
            return true;
          }

          // Shift+Tab: outdent
          if (event.key === 'Tab' && event.shiftKey) {
            event.preventDefault();
            outline.outdentNode(nodeId);
            return true;
          }

          // Ctrl+Shift+Backspace: delete item
          if (event.key === 'Backspace' && mod && event.shiftKey) {
            event.preventDefault();
            outline.deleteNode(nodeId);
            return true;
          }

          // Backspace at start of empty node: delete
          if (event.key === 'Backspace' && !mod && !event.shiftKey) {
            const { from } = view.state.selection;
            const isEmpty = view.state.doc.textContent.length === 0;
            if (from === 1 && isEmpty) {
              event.preventDefault();
              outline.deleteNode(nodeId);
              return true;
            }
          }

          // === NAVIGATION ===

          // Up arrow: previous node
          if (event.key === 'ArrowUp' && !mod) {
            event.preventDefault();
            outline.moveToPrevious();
            return true;
          }

          // Down arrow: next node
          if (event.key === 'ArrowDown' && !mod) {
            event.preventDefault();
            outline.moveToNext();
            return true;
          }

          // Ctrl+Up: swap with previous sibling
          if (event.key === 'ArrowUp' && mod && !event.shiftKey) {
            event.preventDefault();
            outline.swapWithPrevious(nodeId);
            return true;
          }

          // Ctrl+Down: swap with next sibling
          if (event.key === 'ArrowDown' && mod && !event.shiftKey) {
            event.preventDefault();
            outline.swapWithNext(nodeId);
            return true;
          }

          // === COLLAPSE ===

          // Ctrl+. : toggle collapse
          if (event.key === '.' && mod) {
            event.preventDefault();
            outline.toggleCollapse(nodeId);
            return true;
          }

          // === CHECKBOX ===

          // Ctrl+Enter: toggle checkbox (if checkbox type)
          if (event.key === 'Enter' && mod && !event.shiftKey) {
            event.preventDefault();
            const node = outline.getNode(nodeId);
            if (node?.node_type === 'checkbox') {
              outline.toggleCheckbox(nodeId);
            }
            return true;
          }

          // Ctrl+Shift+C: toggle node type (bullet <-> checkbox)
          if (event.key === 'c' && mod && event.shiftKey) {
            event.preventDefault();
            outline.toggleNodeType(nodeId);
            return true;
          }

          return false;
        }
      },
      onUpdate: ({ editor }) => {
        outline.updateContent(item.node.id, editor.getHTML());
      },
      onFocus: () => {
        outline.focus(item.node.id);
      }
    });
  });

  onDestroy(() => {
    if (editorElement && tabHandler) {
      editorElement.removeEventListener('keydown', tabHandler, { capture: true });
    }
    editor?.destroy();
  });

  function handleCollapseClick() {
    outline.toggleCollapse(item.node.id);
  }

  function handleCheckboxClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    outline.toggleCheckbox(item.node.id);
  }

  function handleWikiLinkSelect(nodeId: string, displayText: string) {
    if (!editor || !wikiLinkRange) return;

    // Delete the [[query text and insert the wiki link
    editor
      .chain()
      .focus()
      .deleteRange(wikiLinkRange)
      .insertWikiLink(nodeId, displayText)
      .run();

    showWikiLinkSuggestion = false;
    wikiLinkRange = null;
  }

  function handleWikiLinkClose() {
    showWikiLinkSuggestion = false;
    wikiLinkRange = null;
  }
</script>

<div class="outline-item" class:focused={isFocused} class:checked={item.node.is_checked} style="margin-left: {item.depth * 24}px">
  <div class="item-row">
    {#if item.node.node_type === 'checkbox'}
      <button
        class="checkbox-btn"
        class:checked={item.node.is_checked}
        onclick={handleCheckboxClick}
        tabindex="-1"
        aria-label={item.node.is_checked ? 'Mark incomplete' : 'Mark complete'}
      >
        {#if item.node.is_checked}
          <span class="checkbox-icon checked">✓</span>
        {:else}
          <span class="checkbox-icon"></span>
        {/if}
      </button>
    {:else}
      <button
        class="collapse-btn"
        class:has-children={item.hasChildren}
        class:collapsed={item.node.collapsed}
        onclick={handleCollapseClick}
        tabindex="-1"
      >
        {#if item.hasChildren}
          <span class="collapse-icon">{item.node.collapsed ? '▶' : '▼'}</span>
        {:else}
          <span class="bullet">•</span>
        {/if}
      </button>
    {/if}

    <div class="editor-wrapper" bind:this={editorElement}></div>
  </div>

  {#if isFocused}
    <BacklinksPanel
      nodeId={item.node.id}
      onNavigate={(nodeId) => onNavigateToNode ? onNavigateToNode(nodeId) : outline.focus(nodeId)}
    />
  {/if}

  {#if item.hasChildren && !item.node.collapsed}
    <div class="children">
      {#each item.children as child (child.node.id)}
        <OutlineItem item={child} {onNavigateToNode} />
      {/each}
    </div>
  {/if}
</div>

{#if showWikiLinkSuggestion}
  <WikiLinkSuggestion
    query={wikiLinkQuery}
    position={suggestionPosition}
    onSelect={handleWikiLinkSelect}
    onClose={handleWikiLinkClose}
  />
{/if}

<style>
  .item-row {
    display: flex;
    align-items: flex-start;
    padding: 2px 0;
    border-radius: 4px;
    transition: background-color 0.1s;
  }

  .focused .item-row {
    background-color: rgba(59, 130, 246, 0.1);
  }

  .collapse-btn {
    width: 20px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: #666;
    font-size: 10px;
    flex-shrink: 0;
    padding: 0;
  }

  .collapse-btn:hover {
    color: #333;
  }

  .collapse-btn.has-children {
    cursor: pointer;
  }

  .collapse-icon {
    transition: transform 0.15s;
  }

  .bullet {
    font-size: 14px;
    color: #999;
  }

  .checkbox-btn {
    width: 20px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    padding: 0;
  }

  .checkbox-icon {
    width: 14px;
    height: 14px;
    border: 2px solid #999;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: transparent;
    background: white;
    transition: all 0.15s;
  }

  .checkbox-btn:hover .checkbox-icon {
    border-color: #666;
  }

  .checkbox-icon.checked {
    background: #4caf50;
    border-color: #4caf50;
    color: white;
  }

  /* Strikethrough for checked items */
  .outline-item.checked .editor-wrapper :global(.outline-editor) {
    text-decoration: line-through;
    color: #888;
  }

  .editor-wrapper {
    flex: 1;
    min-width: 0;
  }

  .editor-wrapper :global(.outline-editor) {
    outline: none;
    min-height: 24px;
    line-height: 24px;
  }

  .editor-wrapper :global(.outline-editor p) {
    margin: 0;
  }

  .editor-wrapper :global(.outline-editor strong) {
    font-weight: 600;
  }

  .editor-wrapper :global(.outline-editor em) {
    font-style: italic;
  }

  .editor-wrapper :global(.outline-editor code) {
    background: #f0f0f0;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.9em;
  }

  .editor-wrapper :global(.wiki-link) {
    display: inline-flex;
    align-items: center;
    background: #e3f2fd;
    color: #1976d2;
    padding: 1px 8px;
    border-radius: 12px;
    font-size: 0.9em;
    cursor: pointer;
    text-decoration: none;
    margin: 0 2px;
  }

  .editor-wrapper :global(.wiki-link:hover) {
    background: #bbdefb;
  }

  .children {
    /* Children indentation handled by --indent on each item */
  }
</style>
