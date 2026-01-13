/**
 * Keyboard shortcut handlers for OutlineItem
 *
 * Extracted from OutlineItem.svelte to improve maintainability.
 * Each handler returns true if the event was handled, false otherwise.
 */

import { tick } from 'svelte';
import { DOMSerializer } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import { outline } from './outline.svelte';

/**
 * Context passed to keyboard handlers
 */
export interface KeyboardContext {
  nodeId: string;
  editor: Editor | undefined;
  view: EditorView;
  event: KeyboardEvent;

  // Suggestion popup state
  showWikiLinkSuggestion: boolean;
  showHashtagSuggestion: boolean;
  showDueDateSuggestion: boolean;

  // Callbacks for state changes
  closeWikiLinkSuggestion: () => void;
  closeHashtagSuggestion: () => void;
  closeDueDateSuggestion: () => void;
  openNoteEditor: () => void;
  openDatePicker: (view: EditorView) => void;
  openRecurrencePicker: (view: EditorView) => void;
  webSearch: () => void;
}

/**
 * Handler result - whether the event was handled
 */
type HandlerResult = boolean;

/**
 * Keyboard shortcut definition
 */
interface KeyboardShortcut {
  /** Key code (e.g., 'Enter', 'Tab', 'ArrowUp') */
  key: string;
  /** Handler function - must be synchronous for ProseMirror compatibility */
  handler: (ctx: KeyboardContext) => HandlerResult;
  /** Require Ctrl/Cmd modifier */
  mod?: boolean;
  /** Require Shift modifier */
  shift?: boolean;
  /** Require Alt modifier */
  alt?: boolean;
  /** Description for documentation */
  description?: string;
  /** When true, only run when no modifiers are pressed (except specified) */
  noOtherMods?: boolean;
}

// === Suggestion Popup Handlers ===

function handleSuggestionEscape(ctx: KeyboardContext): HandlerResult {
  if (ctx.showWikiLinkSuggestion) {
    ctx.closeWikiLinkSuggestion();
    return true;
  }
  if (ctx.showHashtagSuggestion) {
    ctx.closeHashtagSuggestion();
    return true;
  }
  if (ctx.showDueDateSuggestion) {
    ctx.closeDueDateSuggestion();
    return true;
  }
  return false;
}

function handleSuggestionNavigation(ctx: KeyboardContext): HandlerResult {
  // Let ArrowUp/Down/Enter/Tab pass to suggestion component
  // Return true to prevent ProseMirror's own bindings from running
  const navKeys = ['ArrowUp', 'ArrowDown', 'Enter', 'Tab'];
  if (navKeys.includes(ctx.event.key)) {
    if (ctx.showWikiLinkSuggestion && ['ArrowUp', 'ArrowDown', 'Enter'].includes(ctx.event.key)) {
      ctx.event.preventDefault();
      return true;
    }
    if (ctx.showHashtagSuggestion) {
      ctx.event.preventDefault();
      return true;
    }
    if (ctx.showDueDateSuggestion) {
      ctx.event.preventDefault();
      return true;
    }
  }
  return false;
}

// === Tab Handling ===

function handleTab(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  ctx.event.stopPropagation();
  if (outline.hasSelection) {
    if (ctx.event.shiftKey) {
      outline.outdentSelectedNodes();
    } else {
      outline.indentSelectedNodes();
    }
  } else {
    if (ctx.event.shiftKey) {
      outline.outdentNode(ctx.nodeId);
    } else {
      outline.indentNode(ctx.nodeId);
    }
  }
  return true;
}

// === Enter Key Handlers ===

function handleShiftEnter(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  ctx.openNoteEditor();
  return true;
}

function handleEnter(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();

  const { from, to } = ctx.view.state.selection;
  const docSize = ctx.view.state.doc.content.size;
  const isEmpty = ctx.view.state.doc.textContent.length === 0;

  // Cursor at end of content (or empty): add empty sibling after
  if (from >= docSize - 1 || isEmpty) {
    outline.addSiblingAfter(ctx.nodeId);
    return true;
  }

  // Cursor at beginning: insert blank item above
  if (from <= 1) {
    outline.addSiblingBefore(ctx.nodeId);
    return true;
  }

  // Cursor in middle: split content
  const beforeSlice = ctx.view.state.doc.slice(0, from);
  const afterSlice = ctx.view.state.doc.slice(to, docSize);

  // Convert slices to HTML using DOMSerializer
  const serializer = DOMSerializer.fromSchema(ctx.view.state.schema);
  const beforeFragment = serializer.serializeFragment(beforeSlice.content);
  const afterFragment = serializer.serializeFragment(afterSlice.content);

  // Convert fragments to HTML strings using XMLSerializer (safe serialization)
  const xmlSerializer = new XMLSerializer();
  const tempContainer = document.createElement('div');

  tempContainer.appendChild(beforeFragment);
  const beforeHtml = tempContainer.childNodes.length > 0
    ? Array.from(tempContainer.childNodes).map(n =>
        n.nodeType === Node.TEXT_NODE ? n.textContent : xmlSerializer.serializeToString(n)
      ).join('')
    : '';

  while (tempContainer.firstChild) tempContainer.removeChild(tempContainer.firstChild);
  tempContainer.appendChild(afterFragment);
  const afterHtml = tempContainer.childNodes.length > 0
    ? Array.from(tempContainer.childNodes).map(n =>
        n.nodeType === Node.TEXT_NODE ? n.textContent : xmlSerializer.serializeToString(n)
      ).join('')
    : '';

  // Split: update current item with before content, create new item with after content
  outline.splitNode(ctx.nodeId, beforeHtml, afterHtml);
  return true;
}

function handleCtrlEnter(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  if (outline.hasSelection) {
    outline.toggleSelectedCheckboxes();
  } else {
    outline.toggleCheckbox(ctx.nodeId);
  }
  return true;
}

// === Backspace/Delete Handlers ===

function handleCtrlShiftBackspace(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  if (outline.hasSelection) {
    outline.deleteSelectedNodes();
  } else {
    outline.deleteNode(ctx.nodeId);
  }
  return true;
}

function handleBackspace(ctx: KeyboardContext): HandlerResult {
  const { from, to } = ctx.view.state.selection;
  const isEmpty = ctx.view.state.doc.textContent.length === 0;
  const isAtStart = from === 1 && to === 1; // Position 1 is start of text in ProseMirror

  if (isEmpty && isAtStart) {
    // Empty node: delete it and focus previous item at end
    ctx.event.preventDefault();
    const visible = outline.getVisibleNodes();
    const idx = visible.findIndex(n => n.id === ctx.nodeId);
    const prevNode = idx > 0 ? visible[idx - 1] : null;

    outline.deleteNode(ctx.nodeId);

    if (prevNode) {
      tick().then(() => {
        outline.focus(prevNode.id);
        setTimeout(() => {
          let element = document.activeElement as HTMLElement | null;
          let editor: any = null;
          while (element && !editor) {
            editor = (element as any).__tiptap_editor;
            element = element.parentElement;
          }
          if (editor) {
            editor.commands.setTextSelection(editor.state.doc.content.size - 1);
          }
        }, 50);
      });
    }
    return true;
  } else if (isAtStart) {
    // At start of content with text: merge into previous node
    ctx.event.preventDefault();
    outline.mergeWithPreviousNode(ctx.nodeId).then(result => {
      if (result) {
        tick().then(() => {
          outline.focus(result.targetId);
          setTimeout(() => {
            let element = document.activeElement as HTMLElement | null;
            let editor: any = null;
            while (element && !editor) {
              editor = (element as any).__tiptap_editor;
              element = element.parentElement;
            }
            if (editor) {
              const pos = Math.min(result.cursorPos + 1, editor.state.doc.content.size);
              editor.commands.setTextSelection(pos);
            }
          }, 50);
        });
      }
    });
    return true;
  }
  return false;
}

function handleDelete(ctx: KeyboardContext): HandlerResult {
  // Forward Delete key (fn+Delete on Mac)
  // - On empty item: delete it and focus next item at start
  // - At end of content: merge with next sibling
  // - Otherwise: let default behavior work (delete next char)
  const { from, to } = ctx.view.state.selection;
  const docSize = ctx.view.state.doc.content.size;
  const isEmpty = ctx.view.state.doc.textContent.length === 0;
  const isAtEnd = from === to && to === docSize - 1;

  if (isEmpty) {
    // Empty node: delete it and focus next item at start
    ctx.event.preventDefault();
    const visible = outline.getVisibleNodes();
    const idx = visible.findIndex(n => n.id === ctx.nodeId);
    const nextNode = idx < visible.length - 1 ? visible[idx + 1] : null;

    outline.deleteNode(ctx.nodeId).then(() => {
      if (nextNode) {
        tick().then(() => {
          outline.focus(nextNode.id);
          // Position cursor at start
          setTimeout(() => {
            let element = document.activeElement as HTMLElement | null;
            let editor: any = null;
            while (element && !editor) {
              editor = (element as any).__tiptap_editor;
              element = element.parentElement;
            }
            if (editor) {
              editor.commands.setTextSelection(1);
            }
          }, 50);
        });
      }
    });
    return true;
  } else if (isAtEnd) {
    // At end of content: merge with next sibling
    // preventDefault immediately, then handle async merge
    ctx.event.preventDefault();
    outline.mergeWithNextSibling(ctx.nodeId).then(result => {
      if (result && ctx.editor) {
        // Position cursor at the merge point (end of original content)
        tick().then(() => {
          if (ctx.editor) {
            const pos = Math.min(result.cursorPos + 1, ctx.editor.state.doc.content.size);
            ctx.editor.commands.setTextSelection(pos);
            ctx.editor.commands.focus();
          }
        });
      }
    });
    return true;
  }
  return false;
}

// === Navigation Handlers ===

function handleArrowUp(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.moveToPrevious();
  return true;
}

function handleArrowDown(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.moveToNext();
  return true;
}

function handleSwapUp(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.swapWithPrevious(ctx.nodeId);
  return true;
}

function handleSwapDown(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.swapWithNext(ctx.nodeId);
  return true;
}

// Vim-style navigation
function handleAltH(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.moveToParent();
  return true;
}

function handleAltL(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.moveToFirstChild();
  return true;
}

function handleAltJ(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.moveToNextSibling();
  return true;
}

function handleAltK(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.moveToPrevSibling();
  return true;
}

// === Indent/Dedent Alternative Shortcuts ===

function handleCtrlComma(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.outdentNode(ctx.nodeId);
  return true;
}

function handleCtrlPeriod(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.toggleCollapse(ctx.nodeId);
  return true;
}

// === Node Type Toggle ===

function handleCtrlShiftX(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.toggleNodeType(ctx.nodeId);
  return true;
}

// === Date Handlers ===

function handleCtrlD(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  ctx.openDatePicker(ctx.view);
  return true;
}

function handleCtrlShiftD(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.clearDate(ctx.nodeId);
  return true;
}

function handleCtrlR(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  ctx.openRecurrencePicker(ctx.view);
  return true;
}

// === Export ===

function handleCtrlShiftE(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.exportSelection();
  return true;
}

// === Web Search ===

function handleCtrlShiftG(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  ctx.webSearch();
  return true;
}

// === Zoom Handlers ===

function handleCtrlBracketRight(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.zoomTo(ctx.nodeId);
  return true;
}

function handleCtrlBracketLeft(ctx: KeyboardContext): HandlerResult {
  ctx.event.preventDefault();
  outline.zoomOut();
  return true;
}

/**
 * Keyboard shortcut definitions
 * Order matters: more specific shortcuts (with more modifiers) should come first
 */
const keyboardShortcuts: KeyboardShortcut[] = [
  // Tab handling (must be first to prevent browser focus navigation)
  { key: 'Tab', handler: handleTab, description: 'Indent/outdent node' },

  // Enter variants
  { key: 'Enter', mod: true, shift: false, handler: handleCtrlEnter, description: 'Toggle completion' },
  { key: 'Enter', mod: false, shift: true, handler: handleShiftEnter, description: 'Toggle note editing' },
  { key: 'Enter', mod: false, shift: false, handler: handleEnter, description: 'Split item at cursor' },

  // Backspace/Delete
  { key: 'Backspace', mod: true, shift: true, handler: handleCtrlShiftBackspace, description: 'Delete item' },
  { key: 'Backspace', mod: false, shift: false, handler: handleBackspace, description: 'Delete empty item at cursor start' },
  { key: 'Delete', mod: false, shift: false, handler: handleDelete, description: 'Delete or merge with next' },

  // Arrow navigation with modifiers (swap)
  { key: 'ArrowUp', mod: true, handler: handleSwapUp, description: 'Swap with previous sibling' },
  { key: 'ArrowUp', shift: true, handler: handleSwapUp, description: 'Swap with previous sibling' },
  { key: 'ArrowDown', mod: true, handler: handleSwapDown, description: 'Swap with next sibling' },
  { key: 'ArrowDown', shift: true, handler: handleSwapDown, description: 'Swap with next sibling' },

  // Arrow navigation (basic)
  { key: 'ArrowUp', mod: false, shift: false, handler: handleArrowUp, noOtherMods: true, description: 'Move to previous node' },
  { key: 'ArrowDown', mod: false, shift: false, handler: handleArrowDown, noOtherMods: true, description: 'Move to next node' },

  // Vim-style navigation (Ctrl+HJKL)
  // J/K = up/down (like arrows), H/L = sibling navigation (same level)
  // Ctrl+Shift+J/K = swap/move item (like Shift+arrows)
  { key: 'j', mod: true, shift: true, handler: handleSwapDown, description: 'Move item down' },
  { key: 'J', mod: true, shift: true, handler: handleSwapDown, description: 'Move item down' },
  { key: 'k', mod: true, shift: true, handler: handleSwapUp, description: 'Move item up' },
  { key: 'K', mod: true, shift: true, handler: handleSwapUp, description: 'Move item up' },
  { key: 'j', mod: true, shift: false, handler: handleArrowDown, description: 'Next item' },
  { key: 'J', mod: true, shift: false, handler: handleArrowDown, description: 'Next item' },
  { key: 'k', mod: true, shift: false, handler: handleArrowUp, description: 'Previous item' },
  { key: 'K', mod: true, shift: false, handler: handleArrowUp, description: 'Previous item' },
  { key: 'h', mod: true, shift: false, handler: handleAltK, description: 'Previous sibling' },
  { key: 'H', mod: true, shift: false, handler: handleAltK, description: 'Previous sibling' },
  { key: 'l', mod: true, shift: false, handler: handleAltJ, description: 'Next sibling' },
  { key: 'L', mod: true, shift: false, handler: handleAltJ, description: 'Next sibling' },
  { key: '-', mod: true, handler: handleAltH, description: 'Go to parent' },

  // Indent/dedent alternatives
  { key: ',', mod: true, handler: handleCtrlComma, description: 'Dedent' },
  { key: '.', mod: true, handler: handleCtrlPeriod, description: 'Toggle collapse' },

  // Node type toggle
  { key: 'x', mod: true, shift: true, handler: handleCtrlShiftX, description: 'Toggle bullet/checkbox' },
  { key: 'X', mod: true, shift: true, handler: handleCtrlShiftX, description: 'Toggle bullet/checkbox' },

  // Date handling
  { key: 'd', mod: true, shift: false, handler: handleCtrlD, description: 'Open date picker' },
  { key: 'd', mod: true, shift: true, handler: handleCtrlShiftD, description: 'Clear date' },
  { key: 'D', mod: true, shift: true, handler: handleCtrlShiftD, description: 'Clear date' },
  { key: 'r', mod: true, shift: false, handler: handleCtrlR, description: 'Open recurrence picker' },

  // Export
  { key: 'e', mod: true, shift: true, handler: handleCtrlShiftE, description: 'Export to markdown' },
  { key: 'E', mod: true, shift: true, handler: handleCtrlShiftE, description: 'Export to markdown' },

  // Web search
  { key: 'g', mod: true, shift: true, handler: handleCtrlShiftG, description: 'Web search' },
  { key: 'G', mod: true, shift: true, handler: handleCtrlShiftG, description: 'Web search' },

  // Zoom
  { key: ']', mod: true, handler: handleCtrlBracketRight, description: 'Zoom into subtree' },
  { key: '[', mod: true, handler: handleCtrlBracketLeft, description: 'Zoom out one level' },
];

/**
 * Check if a keyboard event matches a shortcut definition
 */
function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  const mod = event.ctrlKey || event.metaKey;

  // Key must match (case-insensitive for letters)
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
    return false;
  }

  // Check mod requirement
  if (shortcut.mod !== undefined && mod !== shortcut.mod) {
    return false;
  }

  // Check shift requirement
  if (shortcut.shift !== undefined && event.shiftKey !== shortcut.shift) {
    return false;
  }

  // Check alt requirement
  if (shortcut.alt !== undefined && event.altKey !== shortcut.alt) {
    return false;
  }

  // Check noOtherMods flag
  if (shortcut.noOtherMods) {
    // Ensure only the specified modifiers are pressed
    if (shortcut.mod === undefined && mod) return false;
    if (shortcut.shift === undefined && event.shiftKey) return false;
    if (shortcut.alt === undefined && event.altKey) return false;
  }

  return true;
}

/**
 * Main keyboard event handler
 * Returns true if the event was handled, false otherwise
 */
export function handleKeyDown(ctx: KeyboardContext): boolean {
  // First, handle suggestion popup navigation (Escape)
  if (ctx.event.key === 'Escape') {
    if (handleSuggestionEscape(ctx)) {
      return true;
    }
  }

  // Handle suggestion popup navigation keys (ArrowUp, ArrowDown, Enter, Tab)
  if (ctx.showWikiLinkSuggestion || ctx.showHashtagSuggestion || ctx.showDueDateSuggestion) {
    if (handleSuggestionNavigation(ctx)) {
      return true;
    }
  }

  // Find and execute matching shortcut
  for (const shortcut of keyboardShortcuts) {
    if (matchesShortcut(ctx.event, shortcut)) {
      const result = shortcut.handler(ctx);
      if (result) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get all keyboard shortcuts for documentation
 */
export function getKeyboardShortcuts(): Array<{ key: string; modifiers: string[]; description: string }> {
  return keyboardShortcuts
    .filter(s => s.description)
    .map(s => {
      const modifiers: string[] = [];
      if (s.mod) modifiers.push('Ctrl/Cmd');
      if (s.shift) modifiers.push('Shift');
      if (s.alt) modifiers.push('Alt');
      return {
        key: s.key,
        modifiers,
        description: s.description!,
      };
    });
}
