<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { outline } from './outline.svelte';
  import type { TreeNode } from './types';
  import OutlineItem from './OutlineItem.svelte';

  interface Props {
    item: TreeNode;
  }

  let { item }: Props = $props();

  let editor: Editor | undefined = $state();
  let editorElement: HTMLDivElement | undefined = $state();
  let tabHandler: ((e: KeyboardEvent) => void) | undefined;

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
        })
      ],
      content: item.node.content || '',
      editorProps: {
        attributes: {
          class: 'outline-editor'
        },
        handleKeyDown: (view, event) => {
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
</script>

<div class="outline-item" class:focused={isFocused} style="--depth: {item.depth}">
  <div class="item-row">
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

    <div class="editor-wrapper" bind:this={editorElement}></div>
  </div>

  {#if item.hasChildren && !item.node.collapsed}
    <div class="children">
      {#each item.children as child (child.node.id)}
        <OutlineItem item={child} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .outline-item {
    --indent: calc(var(--depth, 0) * 24px);
  }

  .item-row {
    display: flex;
    align-items: flex-start;
    padding: 2px 0;
    padding-left: var(--indent);
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

  .children {
    /* Children indentation handled by --indent on each item */
  }
</style>
