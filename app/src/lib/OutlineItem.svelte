<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { outline } from './outline.svelte';
  import type { TreeNode } from './types';
  import OutlineItem from './OutlineItem.svelte';
  import { WikiLink } from './WikiLink';
  import { AutoLink } from './AutoLink';
  import { Hashtag } from './Hashtag';
  import { Mention } from './Mention';
  import { DueDate } from './DueDate';
  import WikiLinkSuggestion from './WikiLinkSuggestion.svelte';
  import HashtagSuggestion from './HashtagSuggestion.svelte';
  import DueDateSuggestion from './DueDateSuggestion.svelte';
  import BacklinksPanel from './BacklinksPanel.svelte';
  import DateBadge from './DateBadge.svelte';
  import DatePicker from './DatePicker.svelte';
  import RecurrencePicker from './RecurrencePicker.svelte';
  import ContextMenu from './ContextMenu.svelte';

  interface Props {
    item: TreeNode;
    onNavigateToNode?: (nodeId: string) => void;
  }

  let { item, onNavigateToNode }: Props = $props();

  let editor: Editor | undefined = $state();
  let editorElement: HTMLDivElement | undefined = $state();
  let staticElement: HTMLDivElement | undefined = $state();
  let tabHandler: ((e: KeyboardEvent) => void) | undefined;

  // Wiki link suggestion state
  let showWikiLinkSuggestion = $state(false);
  let wikiLinkQuery = $state('');
  let wikiLinkRange = $state<{ from: number; to: number } | null>(null);
  let suggestionPosition = $state({ x: 0, y: 0 });

  // Hashtag suggestion state
  let showHashtagSuggestion = $state(false);
  let hashtagQuery = $state('');
  let hashtagRange = $state<{ from: number; to: number } | null>(null);
  let hashtagPosition = $state({ x: 0, y: 0 });

  // Inline due date suggestion state
  let showDueDateSuggestion = $state(false);
  let dueDateQuery = $state('');
  let dueDateRange = $state<{ from: number; to: number } | null>(null);
  let dueDatePosition = $state({ x: 0, y: 0 });

  // Date picker state
  let showDatePicker = $state(false);
  let datePickerPosition = $state({ x: 0, y: 0 });

  // Recurrence picker state
  let showRecurrencePicker = $state(false);
  let recurrencePickerPosition = $state({ x: 0, y: 0 });

  // Context menu state
  let showContextMenu = $state(false);
  let contextMenuPosition = $state({ x: 0, y: 0 });

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

  // Lazy editor creation - only create TipTap when focused
  $effect(() => {
    if (!isFocused) {
      // Destroy editor when losing focus to free memory
      if (editor) {
        editor.destroy();
        editor = undefined;
      }
      if (editorElement && tabHandler) {
        editorElement.removeEventListener('keydown', tabHandler, { capture: true });
        tabHandler = undefined;
      }
      return;
    }

    // Wait for editorElement to be available
    if (!editorElement) return;

    // Already have editor
    if (editor) {
      editor.commands.focus('end');
      return;
    }

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

    function updateHashtagPosition(view: any) {
      const coords = view.coordsAtPos(view.state.selection.from);
      hashtagPosition = {
        x: coords.left,
        y: coords.bottom + 5,
      };
    }

    function updateDueDatePosition(view: any) {
      const coords = view.coordsAtPos(view.state.selection.from);
      dueDatePosition = {
        x: coords.left,
        y: coords.bottom + 5,
      };
    }

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
        AutoLink,
        Hashtag.configure({
          onHashtagClick: (tag: string) => {
            // Dispatch custom event for parent to handle search
            window.dispatchEvent(new CustomEvent('hashtag-search', { detail: { tag } }));
          },
        }),
        Mention.configure({
          onMentionClick: (mention: string) => {
            // Dispatch custom event for parent to handle search
            window.dispatchEvent(new CustomEvent('mention-search', { detail: { mention } }));
          },
        }),
        DueDate.configure({
          onDueDateClick: (date: string) => {
            // When clicking on a due date, open the date picker to edit it
            openDatePicker();
          },
        }),
      ],
      content: item.node.content || '',
      editorProps: {
        attributes: {
          class: 'outline-editor'
        },
        handleTextInput: (view, from, to, text) => {
          const state = view.state;
          const prevChar = from > 0 ? state.doc.textBetween(from - 1, from) : '';

          // Auto-convert [ ] and [x] to checkboxes when followed by space
          if (text === ' ' && from >= 3) {
            const prefix = state.doc.textBetween(1, from);
            // Match [ ] or [x] or [X] at start of line
            if (prefix === '[ ]' || prefix === '[x]' || prefix === '[X]') {
              const isChecked = prefix !== '[ ]';
              // Delete the prefix text
              view.dispatch(
                state.tr.delete(1, from)
              );
              // Convert to checkbox via outline
              if (item.node.node_type !== 'checkbox') {
                outline.toggleNodeType(item.node.id);
              }
              // Set checked state if [x]
              if (isChecked && !item.node.is_checked) {
                outline.toggleCheckbox(item.node.id);
              }
              return true;
            }
          }

          // Detect [[ trigger for wiki links
          if (text === '[' && prevChar === '[') {
            showWikiLinkSuggestion = true;
            wikiLinkQuery = '';
            wikiLinkRange = { from: from - 1, to: from + 1 };
            updateSuggestionPosition(view);
            return false;
          }

          // If wiki link suggestion is active, update query
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
            return false;
          }

          // Detect # trigger for hashtags (must be at start or after whitespace)
          if (text === '#' && (prevChar === '' || prevChar === ' ' || prevChar === '\t' || from === 1)) {
            showHashtagSuggestion = true;
            hashtagQuery = '';
            hashtagRange = { from: from, to: from + 1 };
            updateHashtagPosition(view);
            return false;
          }

          // If hashtag suggestion is active, update query
          if (showHashtagSuggestion && hashtagRange) {
            // Check for space or special char to close
            if (text === ' ' || text === '\t' || text === '\n') {
              showHashtagSuggestion = false;
              hashtagRange = null;
              return false;
            }

            // Update query (tag after #)
            const queryStart = hashtagRange.from + 1;
            const currentQuery = from > queryStart ? state.doc.textBetween(queryStart, from) + text : text;
            hashtagQuery = currentQuery;
            hashtagRange = { ...hashtagRange, to: from + text.length + 1 };
          }

          // Detect !( trigger for inline due dates
          if (text === '(' && prevChar === '!') {
            showDueDateSuggestion = true;
            dueDateQuery = '';
            dueDateRange = { from: from - 1, to: from + 1 };
            updateDueDatePosition(view);
            return false;
          }

          // If due date suggestion is active, update query
          if (showDueDateSuggestion && dueDateRange) {
            // Check for ) to close and confirm
            if (text === ')') {
              // Close suggestion - the date will be inserted via the handler
              showDueDateSuggestion = false;
              dueDateRange = null;
              return false;
            }

            // Update query (content between !( and current position)
            const queryStart = dueDateRange.from + 2;
            const currentQuery = from > queryStart ? state.doc.textBetween(queryStart, from) + text : text;
            dueDateQuery = currentQuery;
            dueDateRange = { ...dueDateRange, to: from + text.length + 1 };
          }

          return false;
        },
        handleKeyDown: (view, event) => {
          const mod = event.ctrlKey || event.metaKey;
          const nodeId = item.node.id;

          // === TAB HANDLING (must be first to prevent browser focus navigation) ===

          // Tab: indent, Shift+Tab: outdent
          if (event.key === 'Tab') {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) {
              outline.outdentNode(nodeId);
            } else {
              outline.indentNode(nodeId);
            }
            return true;
          }

          // Handle wiki link suggestion navigation
          if (showWikiLinkSuggestion) {
            if (event.key === 'Escape') {
              showWikiLinkSuggestion = false;
              wikiLinkRange = null;
              return true;
            }
            // Let ArrowUp/Down/Enter pass to suggestion component
            // But prevent default to avoid inserting newline on Enter
            if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
              event.preventDefault();
              return false; // Let window handler catch it
            }
          }

          // Handle hashtag suggestion navigation
          if (showHashtagSuggestion) {
            if (event.key === 'Escape') {
              showHashtagSuggestion = false;
              hashtagRange = null;
              return true;
            }
            // Let ArrowUp/Down/Enter/Tab pass to suggestion component
            // But prevent default to avoid inserting newline on Enter
            if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(event.key)) {
              event.preventDefault();
              return false; // Let window handler catch it
            }
          }

          // Handle due date suggestion navigation
          if (showDueDateSuggestion) {
            if (event.key === 'Escape') {
              showDueDateSuggestion = false;
              dueDateRange = null;
              return true;
            }
            // Let ArrowUp/Down/Enter/Tab pass to suggestion component
            // But prevent default to avoid inserting newline on Enter
            if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(event.key)) {
              event.preventDefault();
              return false; // Let window handler catch it
            }
          }

          // === EDITING ===

          // Enter: add sibling below
          if (event.key === 'Enter' && !mod && !event.shiftKey) {
            event.preventDefault();
            outline.addSiblingAfter(nodeId);
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
          if (event.key === 'ArrowUp' && !mod && !event.shiftKey) {
            event.preventDefault();
            outline.moveToPrevious();
            return true;
          }

          // Down arrow: next node
          if (event.key === 'ArrowDown' && !mod && !event.shiftKey) {
            event.preventDefault();
            outline.moveToNext();
            return true;
          }

          // Shift+Up or Ctrl+Up: swap with previous sibling
          if (event.key === 'ArrowUp' && (event.shiftKey || mod)) {
            event.preventDefault();
            outline.swapWithPrevious(nodeId);
            return true;
          }

          // Shift+Down or Ctrl+Down: swap with next sibling
          if (event.key === 'ArrowDown' && (event.shiftKey || mod)) {
            event.preventDefault();
            outline.swapWithNext(nodeId);
            return true;
          }

          // === INDENT/DEDENT (alternative shortcuts) ===

          // Ctrl+, : dedent (< without shift)
          if (event.key === ',' && mod) {
            event.preventDefault();
            outline.outdentNode(nodeId);
            return true;
          }

          // Ctrl+. : indent (> without shift)
          if (event.key === '.' && mod) {
            event.preventDefault();
            outline.indentNode(nodeId);
            return true;
          }

          // === COMPLETION ===

          // Ctrl+Enter: toggle completion (works for any item type)
          if (event.key === 'Enter' && mod && !event.shiftKey) {
            event.preventDefault();
            outline.toggleCheckbox(nodeId);
            return true;
          }

          // Ctrl+Shift+C: toggle node type (bullet <-> checkbox)
          if (event.key === 'c' && mod && event.shiftKey) {
            event.preventDefault();
            outline.toggleNodeType(nodeId);
            return true;
          }

          // === DATE ===

          // Ctrl+D: open date picker
          if (event.key === 'd' && mod && !event.shiftKey) {
            event.preventDefault();
            openDatePicker(view);
            return true;
          }

          // Ctrl+Shift+D: clear date
          if (event.key === 'd' && mod && event.shiftKey) {
            event.preventDefault();
            outline.clearDate(nodeId);
            return true;
          }

          // Ctrl+R: open recurrence picker
          if (event.key === 'r' && mod && !event.shiftKey) {
            event.preventDefault();
            openRecurrencePicker(view);
            return true;
          }

          return false;
        },
        handleDrop: (view, event, slice, moved) => {
          // Prevent TipTap from handling drops of our outline nodes
          if (event.dataTransfer?.types.includes('application/x-outline-node')) {
            return true; // Prevent ProseMirror from handling
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

    // Focus the newly created editor
    setTimeout(() => {
      editor?.commands.focus('end');
    }, 0);
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

  function openDatePicker(view?: any) {
    if (view) {
      const coords = view.coordsAtPos(view.state.selection.from);
      datePickerPosition = { x: coords.left, y: coords.bottom + 5 };
    } else if (editorElement) {
      const rect = editorElement.getBoundingClientRect();
      datePickerPosition = { x: rect.left, y: rect.bottom + 5 };
    }
    showDatePicker = true;
  }

  function handleDateBadgeClick() {
    openDatePicker();
  }

  function handleDateSelect(date: string | null) {
    outline.setDate(item.node.id, date);
    showDatePicker = false;
  }

  function handleDatePickerClose() {
    showDatePicker = false;
  }

  function openRecurrencePicker(view?: any) {
    if (view) {
      const coords = view.coordsAtPos(view.state.selection.from);
      recurrencePickerPosition = { x: coords.left, y: coords.bottom + 5 };
    } else if (editorElement) {
      const rect = editorElement.getBoundingClientRect();
      recurrencePickerPosition = { x: rect.left, y: rect.bottom + 5 };
    }
    showRecurrencePicker = true;
  }

  function handleRecurrenceSelect(rrule: string | null) {
    outline.setRecurrence(item.node.id, rrule);
    showRecurrencePicker = false;
  }

  function handleRecurrencePickerClose() {
    showRecurrencePicker = false;
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

  function handleHashtagSelect(tag: string) {
    if (!editor || !hashtagRange) return;

    // Delete the # and partial tag text, insert the complete hashtag
    editor
      .chain()
      .focus()
      .deleteRange(hashtagRange)
      .insertContent(`#${tag} `)
      .run();

    showHashtagSuggestion = false;
    hashtagRange = null;
  }

  function handleHashtagClose() {
    showHashtagSuggestion = false;
    hashtagRange = null;
  }

  function handleDueDateSelect(date: string) {
    if (!editor || !dueDateRange) return;

    // Delete the !( and partial text, insert the complete due date
    editor
      .chain()
      .focus()
      .deleteRange(dueDateRange)
      .insertContent(`!(${date}) `)
      .run();

    showDueDateSuggestion = false;
    dueDateRange = null;
  }

  function handleDueDateClose() {
    showDueDateSuggestion = false;
    dueDateRange = null;
  }

  function handleRowClick(e: MouseEvent) {
    // Don't handle if clicking on buttons or the editor itself
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('.outline-editor') || target.closest('.drag-handle') || target.closest('.static-content')) {
      return;
    }
    // Focus the editor at the end when clicking on empty space in the row
    editor?.commands.focus('end');
  }

  function handleStaticClick(e: MouseEvent) {
    const target = e.target as HTMLElement;

    // Handle wiki link clicks
    const wikiLink = target.closest('.wiki-link');
    if (wikiLink) {
      e.preventDefault();
      e.stopPropagation();
      const nodeId = wikiLink.getAttribute('data-node-id');
      if (nodeId) {
        if (onNavigateToNode) {
          onNavigateToNode(nodeId);
        } else {
          outline.focus(nodeId);
        }
      }
      return;
    }

    // Handle hashtag clicks
    const hashtag = target.closest('.hashtag');
    if (hashtag) {
      e.preventDefault();
      e.stopPropagation();
      const tag = hashtag.getAttribute('data-tag');
      if (tag) {
        window.dispatchEvent(new CustomEvent('hashtag-search', { detail: { tag } }));
      }
      return;
    }

    // Handle mention clicks
    const mention = target.closest('.mention');
    if (mention) {
      e.preventDefault();
      e.stopPropagation();
      const mentionName = mention.getAttribute('data-mention');
      if (mentionName) {
        window.dispatchEvent(new CustomEvent('mention-search', { detail: { mention: mentionName } }));
      }
      return;
    }

    // Handle auto-link clicks
    const autoLink = target.closest('.auto-link');
    if (autoLink) {
      e.preventDefault();
      e.stopPropagation();
      const href = autoLink.getAttribute('href');
      if (href) {
        window.open(href, '_blank');
      }
      return;
    }

    // Handle due-date clicks
    const dueDate = target.closest('.due-date');
    if (dueDate) {
      e.preventDefault();
      e.stopPropagation();
      // Focus first, then open date picker
      outline.focus(item.node.id);
      return;
    }

    // Default: focus this node to enter edit mode
    outline.focus(item.node.id);
  }

  // Drag and drop handlers
  let isDragOver = $state(false);
  let dropPosition: 'before' | 'after' | 'child' | null = $state(null);

  function handleDragStart(e: DragEvent) {
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Use custom MIME type so TipTap won't try to insert it as text
      e.dataTransfer.setData('application/x-outline-node', item.node.id);
    }
    outline.startDrag(item.node.id);
  }

  function handleDragEnd(e: DragEvent) {
    e.stopPropagation();
    outline.endDrag();
    isDragOver = false;
    dropPosition = null;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Don't allow dropping on self
    if (outline.draggedId === item.node.id) {
      return;
    }

    isDragOver = true;

    // Determine drop position based on mouse Y position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    if (y < height * 0.25) {
      dropPosition = 'before';
    } else if (y > height * 0.75) {
      dropPosition = 'after';
    } else {
      dropPosition = 'child';
    }

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.stopPropagation();
    isDragOver = false;
    dropPosition = null;
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    contextMenuPosition = { x: e.clientX, y: e.clientY };
    showContextMenu = true;
    outline.focus(item.node.id);
  }

  // Delete all completed descendants
  async function deleteCompletedChildren() {
    const nodeMap = outline.nodes.reduce((map, n) => {
      map.set(n.id, n);
      return map;
    }, new Map());

    // Find all completed descendants
    function getCompletedDescendants(parentId: string): string[] {
      const completedIds: string[] = [];
      for (const node of outline.nodes) {
        if (node.parent_id === parentId) {
          if (node.is_checked) {
            completedIds.push(node.id);
          }
          // Also check children of non-completed items
          completedIds.push(...getCompletedDescendants(node.id));
        }
      }
      return completedIds;
    }

    const toDelete = getCompletedDescendants(item.node.id);
    for (const id of toDelete) {
      await outline.deleteNode(id);
    }
  }

  const contextMenuItems = $derived([
    {
      label: item.node.is_checked ? 'Mark Incomplete' : 'Mark Complete',
      action: () => outline.toggleCheckbox(item.node.id),
      shortcut: 'Ctrl+Enter',
    },
    {
      label: item.node.node_type === 'checkbox' ? 'Convert to Bullet' : 'Convert to Checkbox',
      action: () => outline.toggleNodeType(item.node.id),
      shortcut: 'Ctrl+Shift+C',
    },
    { separator: true as const },
    {
      label: 'Indent',
      action: () => outline.indentNode(item.node.id),
      shortcut: 'Tab',
    },
    {
      label: 'Outdent',
      action: () => outline.outdentNode(item.node.id),
      shortcut: 'Shift+Tab',
    },
    { separator: true as const },
    {
      label: 'Delete Completed Children',
      action: deleteCompletedChildren,
      disabled: !outline.nodes.some(n => n.parent_id === item.node.id && n.is_checked),
    },
    { separator: true as const },
    {
      label: 'Delete',
      action: () => outline.deleteNode(item.node.id),
      shortcut: 'Ctrl+Shift+Backspace',
    },
  ]);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (outline.draggedId && outline.draggedId !== item.node.id) {
      if (dropPosition === 'child') {
        outline.dropOnNode(item.node.id, true);
      } else {
        outline.dropOnNode(item.node.id, false);
      }
    }

    isDragOver = false;
    dropPosition = null;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="outline-item"
  class:focused={isFocused}
  class:checked={item.node.is_checked}
  class:drag-over={isDragOver}
  class:drop-before={dropPosition === 'before'}
  class:drop-after={dropPosition === 'after'}
  class:drop-child={dropPosition === 'child'}
  class:dragging={outline.draggedId === item.node.id}
  style="margin-left: {item.depth * 24}px"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="item-row" onclick={handleRowClick} oncontextmenu={handleContextMenu}>
    {#if item.hasChildren && item.node.node_type !== 'checkbox'}
      <button
        class="expand-btn"
        class:collapsed={item.node.collapsed}
        onclick={handleCollapseClick}
        tabindex="-1"
        aria-label={item.node.collapsed ? 'Expand' : 'Collapse'}
      >
        <span class="expand-icon">{item.node.collapsed ? '▶' : '▼'}</span>
      </button>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class="drag-handle"
      draggable="true"
      ondragstart={handleDragStart}
      ondragend={handleDragEnd}
    >
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
        <span class="bullet">•</span>
      {/if}
    </span>

    {#if isFocused}
      <div class="editor-wrapper" bind:this={editorElement}></div>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class="editor-wrapper static-content"
        bind:this={staticElement}
        onclick={handleStaticClick}
      >
        {@html item.node.content || '<p></p>'}
      </div>
    {/if}

    {#if item.node.date_recurrence}
      <span class="recurrence-indicator" title="Recurring: {item.node.date_recurrence}">🔄</span>
    {/if}

    {#if item.node.date}
      <DateBadge
        date={item.node.date}
        isChecked={item.node.is_checked}
        onclick={handleDateBadgeClick}
      />
    {/if}
  </div>

  {#if isFocused}
    <BacklinksPanel
      nodeId={item.node.id}
      onNavigate={(nodeId) => onNavigateToNode ? onNavigateToNode(nodeId) : outline.focus(nodeId)}
    />
  {/if}

  {#if item.hasChildren && !item.node.collapsed}
    <div class="children-wrapper">
      <div class="indent-guide"></div>
      <div class="children">
        {#each item.children as child (child.node.id)}
          <OutlineItem item={child} {onNavigateToNode} />
        {/each}
      </div>
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

{#if showHashtagSuggestion}
  <HashtagSuggestion
    query={hashtagQuery}
    position={hashtagPosition}
    onSelect={handleHashtagSelect}
    onClose={handleHashtagClose}
  />
{/if}

{#if showDueDateSuggestion}
  <DueDateSuggestion
    query={dueDateQuery}
    position={dueDatePosition}
    onSelect={handleDueDateSelect}
    onClose={handleDueDateClose}
  />
{/if}

{#if showDatePicker}
  <DatePicker
    position={datePickerPosition}
    currentDate={item.node.date}
    onSelect={handleDateSelect}
    onClose={handleDatePickerClose}
  />
{/if}

{#if showRecurrencePicker}
  <RecurrencePicker
    position={recurrencePickerPosition}
    currentRecurrence={item.node.date_recurrence}
    onSelect={handleRecurrenceSelect}
    onClose={handleRecurrencePickerClose}
  />
{/if}

{#if showContextMenu}
  <ContextMenu
    items={contextMenuItems}
    position={contextMenuPosition}
    onClose={() => showContextMenu = false}
  />
{/if}

<style>
  .item-row {
    display: flex;
    align-items: flex-start;
    padding: 2px 0;
    border-radius: 4px;
    transition: background-color 0.1s;
    cursor: text;
  }

  .focused .item-row {
    background-color: var(--selection-bg);
  }

  .bullet {
    font-size: 14px;
    color: var(--text-tertiary);
  }

  /* Dim bullet for completed non-checkbox items */
  .outline-item.checked .bullet {
    opacity: 0.4;
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
    border: 2px solid var(--checkbox-border);
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: transparent;
    background: var(--bg-elevated);
    transition: all 0.15s;
  }

  .checkbox-btn:hover .checkbox-icon {
    border-color: var(--checkbox-border-hover);
  }

  .checkbox-icon.checked {
    background: var(--checkbox-checked-bg);
    border-color: var(--checkbox-checked-bg);
    color: white;
  }

  /* Strikethrough for checked items */
  .outline-item.checked .editor-wrapper :global(.outline-editor),
  .outline-item.checked .editor-wrapper.static-content {
    text-decoration: line-through;
    color: var(--text-tertiary);
  }

  /* Static content (non-focused items) - matches editor styling */
  .static-content {
    cursor: text;
    min-height: 24px;
    line-height: 24px;
  }

  .static-content :global(p) {
    margin: 0;
  }

  .static-content :global(strong) {
    font-weight: 600;
  }

  .static-content :global(em) {
    font-style: italic;
  }

  .static-content :global(code) {
    background: var(--bg-tertiary);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.9em;
  }

  .recurrence-indicator {
    font-size: 12px;
    margin-left: 4px;
    cursor: default;
    opacity: 0.7;
  }

  .recurrence-indicator:hover {
    opacity: 1;
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
    background: var(--bg-tertiary);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.9em;
  }

  .editor-wrapper :global(.wiki-link) {
    display: inline-flex;
    align-items: center;
    background: var(--wiki-link-bg);
    color: var(--wiki-link-color);
    padding: 1px 8px;
    border-radius: 12px;
    font-size: 0.9em;
    cursor: pointer;
    text-decoration: none;
    margin: 0 2px;
  }

  .editor-wrapper :global(.wiki-link:hover) {
    background: var(--wiki-link-bg-hover);
  }

  .editor-wrapper :global(.auto-link) {
    color: var(--auto-link-color);
    text-decoration: underline;
    text-decoration-color: var(--auto-link-underline);
    cursor: pointer;
  }

  .editor-wrapper :global(.auto-link:hover) {
    text-decoration-color: var(--auto-link-color);
  }

  .editor-wrapper :global(.hashtag) {
    color: var(--hashtag-color);
    background: var(--hashtag-bg);
    padding: 1px 4px;
    border-radius: 3px;
    cursor: pointer;
  }

  .editor-wrapper :global(.hashtag:hover) {
    background: var(--hashtag-bg-hover);
  }

  .editor-wrapper :global(.mention) {
    color: var(--mention-color);
    background: var(--mention-bg);
    padding: 1px 4px;
    border-radius: 3px;
    cursor: pointer;
  }

  .editor-wrapper :global(.mention:hover) {
    background: var(--mention-bg-hover);
  }

  /* Inline due dates */
  .editor-wrapper :global(.due-date) {
    display: inline-flex;
    align-items: center;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 0.85em;
    font-weight: 500;
    cursor: pointer;
    margin: 0 2px;
    transition: all 0.15s;
  }

  .editor-wrapper :global(.due-date-overdue) {
    background: var(--date-overdue-bg);
    color: var(--date-overdue);
  }

  .editor-wrapper :global(.due-date-overdue:hover) {
    background: var(--date-overdue-bg-hover);
  }

  .editor-wrapper :global(.due-date-today) {
    background: var(--date-today-bg);
    color: var(--date-today);
  }

  .editor-wrapper :global(.due-date-today:hover) {
    background: var(--date-today-bg-hover);
  }

  .editor-wrapper :global(.due-date-upcoming) {
    background: var(--date-upcoming-bg);
    color: var(--date-upcoming);
  }

  .editor-wrapper :global(.due-date-upcoming:hover) {
    background: var(--date-upcoming-bg-hover);
  }

  .editor-wrapper :global(.due-date-future) {
    background: var(--date-future-bg);
    color: var(--date-future);
  }

  .editor-wrapper :global(.due-date-future:hover) {
    background: var(--date-future-bg-hover);
  }

  .editor-wrapper :global(.due-date-completed) {
    background: var(--date-completed-bg);
    color: var(--date-completed);
    text-decoration: line-through;
  }

  .editor-wrapper :global(.due-date-completed:hover) {
    background: var(--date-completed-bg-hover);
  }

  .children-wrapper {
    position: relative;
    display: block;
  }

  .indent-guide {
    position: absolute;
    left: 9px; /* Center under the bullet (20px drag-handle / 2 - 1px line / 2) */
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--indent-guide-color);
    opacity: 0.5;
  }

  .children {
    display: block;
  }

  /* Expand/collapse button */
  .expand-btn {
    width: 16px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-tertiary);
    font-size: 8px;
    flex-shrink: 0;
    padding: 0;
    margin-right: 2px;
  }

  .expand-btn:hover {
    color: var(--text-primary);
  }

  .expand-icon {
    transition: transform 0.15s;
  }

  /* Drag handle (wraps bullet) */
  .drag-handle {
    width: 20px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    flex-shrink: 0;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  /* Drag and drop states */
  .outline-item.dragging {
    opacity: 0.4;
  }


  .outline-item.drop-before {
    position: relative;
  }

  .outline-item.drop-before::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--drop-indicator);
    border-radius: 1px;
  }

  .outline-item.drop-after {
    position: relative;
  }

  .outline-item.drop-after::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--drop-indicator);
    border-radius: 1px;
  }

  .outline-item.drop-child .item-row {
    background: var(--selection-bg);
    border-radius: 4px;
  }
</style>
