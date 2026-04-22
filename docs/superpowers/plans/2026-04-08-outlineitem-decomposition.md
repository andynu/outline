# OutlineItem Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 2082-line OutlineItem.tsx into 7 focused files, reducing it to ~850 lines of orchestration and rendering.

**Architecture:** Extract 4 custom hooks and 2 pure functions from OutlineItem.tsx into an `outline-item/` directory. OutlineItem becomes `outline-item/index.tsx` and re-exports. Each extraction is a mechanical move — no logic changes, no new features.

**Tech Stack:** React 19, TipTap, TypeScript, Zustand

---

### Task 1: Create directory and move OutlineItem.tsx

**Files:**
- Move: `app/src/components/OutlineItem.tsx` → `app/src/components/outline-item/index.tsx`
- Modify: `app/src/App.tsx:5`

- [ ] **Step 1: Create directory and move file**

```bash
cd /home/andy/projects/outline/app/src/components
mkdir -p outline-item
git mv OutlineItem.tsx outline-item/index.tsx
```

- [ ] **Step 2: Update import in App.tsx**

Change line 5 from:
```typescript
import { OutlineItem } from './components/OutlineItem';
```
to:
```typescript
import { OutlineItem } from './components/outline-item';
```

- [ ] **Step 3: Update relative imports inside index.tsx**

All imports in the moved file that use `'../'` prefix now need `'../../'` since we're one directory deeper. Update these imports at the top of `outline-item/index.tsx`:

```typescript
// These change from '../' to '../../'
import type { TreeNode } from '../../lib/types';
import { useOutlineStore } from '../../store/outlineStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { ContextMenu, closeAllContextMenus } from '../ui/ContextMenu';
import { processStaticContentElement, handleStaticContentClick } from '../../lib/renderStaticContent';

import { WikiLink, createWikiLinkInputHandler } from '../../lib/WikiLink';
import { Hashtag } from '../../lib/Hashtag';
import { DueDate } from '../../lib/DueDate';
import { AutoLink } from '../../lib/AutoLink';
import { MarkdownLink } from '../../lib/MarkdownLink';
import { Mention } from '../../lib/Mention';
import { EmojiShortcode } from '../../lib/EmojiShortcode';
import { CustomEmojiNode } from '../../lib/CustomEmojiNode';

import { WikiLinkSuggestion } from '../ui/WikiLinkSuggestion';
import { HashtagSuggestion } from '../ui/HashtagSuggestion';
import { DueDateSuggestion } from '../ui/DueDateSuggestion';
import { EmojiSuggestion } from '../ui/EmojiSuggestion';
import { DatePicker, type DatePickerMode } from '../ui/DatePicker';
import { RecurrencePicker, type RecurrenceMode } from '../ui/RecurrencePicker';
import { formatDateRelative, formatDateRange } from '../../lib/dateUtils';
import { looksLikeMarkdownList, parseMarkdownList } from '../../lib/markdownPaste';
import { NODE_COLORS, getColorCss } from '../../lib/colorPalette';
import { useBookmarkStore } from '../../store/bookmarkStore';
```

Note: imports from `'./ui/'` become `'../ui/'` (up one to components, then down into ui). Imports from `'../lib/'` become `'../../lib/'`. Imports from `'../store/'` become `'../../store/'`.

- [ ] **Step 4: Run type check**

```bash
cd /home/andy/projects/outline/app && npm run check
```

Expected: No errors.

- [ ] **Step 5: Run Playwright tests**

```bash
cd /home/andy/projects/outline/app && npx playwright test --reporter=line 2>&1 | tail -5
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/andy/projects/outline
git add app/src/components/outline-item/index.tsx app/src/App.tsx
git add -u  # catch the deleted OutlineItem.tsx
git commit -m "$(cat <<'EOF'
Move OutlineItem.tsx into outline-item/ directory

Prepares for decomposition by moving into its own directory.
No logic changes — just a move and import path updates.
EOF
)"
```

---

### Task 2: Extract `itemContextMenu.ts`

**Files:**
- Create: `app/src/components/outline-item/itemContextMenu.ts`
- Modify: `app/src/components/outline-item/index.tsx`

- [ ] **Step 1: Create itemContextMenu.ts**

Create `app/src/components/outline-item/itemContextMenu.ts` with this content:

```typescript
import type { MenuItem } from '../ui/ContextMenu';
import type { Node } from '../../lib/types';
import { NODE_COLORS } from '../../lib/colorPalette';
import { useOutlineStore } from '../../store/outlineStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useBookmarkStore } from '../../store/bookmarkStore';

interface ItemContextMenuParams {
  node: Node;
  hasChildren: boolean;
  isBookmarked: boolean;
  documentId: string | null;
  plainTextContent: string;
  contextMenuPosition: { x: number; y: number };
  // Store actions
  toggleCheckbox: (id: string) => void;
  toggleNodeType: (id: string) => void;
  setNodeTypeTo: (id: string, type: string) => void;
  setHeadingLevel: (id: string, level: number) => void;
  clearHeading: (id: string) => void;
  toggleCollapse: (id: string) => void;
  zoomTo: (id: string) => void;
  zoomToParent: () => void;
  openNoteEditor: (id: string) => void;
  indentNode: (id: string) => void;
  outdentNode: (id: string) => void;
  deleteNode: (id: string) => void;
  setNodeColor: (id: string, color: string) => void;
  copyToClipboard: () => void;
  webSearch: () => void;
  // Date/recurrence picker openers
  setDatePickerPosition: (pos: { x: number; y: number }) => void;
  setDatePickerMode: (mode: 'due' | 'defer' | 'end') => void;
  setShowDatePicker: (show: boolean) => void;
}

export function buildItemContextMenu(params: ItemContextMenuParams): MenuItem[] {
  const {
    node, hasChildren, isBookmarked, documentId, plainTextContent, contextMenuPosition,
    toggleCheckbox, toggleNodeType, setNodeTypeTo, setHeadingLevel, clearHeading,
    toggleCollapse, zoomTo, zoomToParent, openNoteEditor, indentNode, outdentNode,
    deleteNode, setNodeColor, copyToClipboard, webSearch,
    setDatePickerPosition, setDatePickerMode, setShowDatePicker,
  } = params;

  return [
    {
      label: node.is_checked ? 'Mark Incomplete' : 'Mark Complete',
      action: () => toggleCheckbox(node.id),
      shortcut: 'Ctrl+Enter',
    },
    {
      label: node.node_type === 'checkbox' ? 'Convert to Bullet' : 'Convert to Checkbox',
      action: () => toggleNodeType(node.id),
      shortcut: 'Ctrl+Shift+X',
    },
    {
      label: 'Convert to Numbered',
      action: () => setNodeTypeTo(node.id, 'numbered'),
      disabled: node.node_type === 'numbered',
    },
    { separator: true as const },
    {
      headingPicker: true as const,
      currentLevel: node.node_type === 'heading' ? (node.heading_level ?? null) : null,
      onSelect: (level: number) => { if (level === 0) clearHeading(node.id); else setHeadingLevel(node.id, level); },
    },
    { separator: true as const },
    {
      submenu: true as const,
      label: 'Dates',
      children: [
        {
          label: node.date ? 'Change Due Date' : 'Set Due Date',
          action: () => {
            setDatePickerPosition(contextMenuPosition);
            setDatePickerMode('due');
            setShowDatePicker(true);
          },
          shortcut: 'Ctrl+D',
        },
        {
          label: node.date_end ? 'Change End Date' : 'Set End Date',
          action: () => {
            setDatePickerPosition(contextMenuPosition);
            setDatePickerMode('end');
            setShowDatePicker(true);
          },
        },
        {
          label: node.defer_date ? 'Change Defer Date' : 'Defer Until...',
          action: () => {
            setDatePickerPosition(contextMenuPosition);
            setDatePickerMode('defer');
            setShowDatePicker(true);
          },
          shortcut: 'Ctrl+Shift+D',
        },
      ],
    },
    { separator: true as const },
    {
      submenu: true as const,
      label: 'Copy / Export',
      children: [
        {
          label: 'Copy',
          action: copyToClipboard,
          shortcut: 'Ctrl+C',
        },
        {
          label: 'Copy tree as Markdown',
          action: () => useSelectionStore.getState().copyTreeAsMarkdown(node.id),
          shortcut: 'Ctrl+Shift+C',
          disabled: !hasChildren,
        },
        {
          label: 'Copy tree as Plain Text',
          action: () => useSelectionStore.getState().copyTreeAsPlainText(node.id),
          disabled: !hasChildren,
        },
        {
          label: 'Copy Short ID',
          action: () => {
            const prefix = useOutlineStore.getState().docPrefix;
            const sid = node.short_id;
            if (prefix && sid) {
              navigator.clipboard.writeText(`${prefix}-${sid}`);
            }
          },
          disabled: !node.short_id,
        },
        { separator: true as const },
        {
          label: 'Export to Markdown',
          action: () => useSelectionStore.getState().exportSelection(),
          shortcut: 'Ctrl+Shift+E',
        },
      ],
    },
    {
      label: 'Web Search',
      action: webSearch,
      shortcut: 'Ctrl+Shift+G',
      disabled: !plainTextContent.trim(),
    },
    { separator: true as const },
    {
      label: node.collapsed ? 'Expand' : 'Collapse',
      action: () => toggleCollapse(node.id),
      shortcut: 'Ctrl+.',
      disabled: !hasChildren,
    },
    { separator: true as const },
    {
      label: 'Zoom In',
      action: () => zoomTo(node.id),
      shortcut: 'Ctrl+]',
      disabled: !hasChildren,
    },
    {
      label: 'Zoom Out',
      action: () => zoomToParent(),
      shortcut: 'Ctrl+[',
    },
    { separator: true as const },
    {
      label: 'Edit Note',
      action: () => openNoteEditor(node.id),
      shortcut: 'Ctrl+Shift+Enter',
    },
    { separator: true as const },
    {
      label: 'Indent',
      action: () => indentNode(node.id),
      shortcut: 'Tab',
    },
    {
      label: 'Outdent',
      action: () => outdentNode(node.id),
      shortcut: 'Shift+Tab',
    },
    { separator: true as const },
    {
      submenu: true as const,
      label: 'Sort children',
      disabled: !hasChildren,
      children: [
        {
          label: 'Title (A-Z)',
          action: () => useSelectionStore.getState().sortChildrenByTitle(node.id),
          disabled: !hasChildren,
        },
        {
          label: 'Title (Z-A)',
          action: () => useSelectionStore.getState().sortChildrenByTitleReverse(node.id),
          disabled: !hasChildren,
        },
        { separator: true as const },
        {
          label: 'Date (newest)',
          action: () => useSelectionStore.getState().sortChildrenByDate(node.id),
          disabled: !hasChildren,
        },
        {
          label: 'Date (oldest)',
          action: () => useSelectionStore.getState().sortChildrenByDateReverse(node.id),
          disabled: !hasChildren,
        },
        { separator: true as const },
        {
          label: 'Updated (newest)',
          action: () => useSelectionStore.getState().sortChildrenByUpdated(node.id),
          disabled: !hasChildren,
        },
        {
          label: 'Updated (oldest)',
          action: () => useSelectionStore.getState().sortChildrenByUpdatedReverse(node.id),
          disabled: !hasChildren,
        },
        { separator: true as const },
        {
          label: 'Created (newest)',
          action: () => useSelectionStore.getState().sortChildrenByCreated(node.id),
          disabled: !hasChildren,
        },
        {
          label: 'Created (oldest)',
          action: () => useSelectionStore.getState().sortChildrenByCreatedReverse(node.id),
          disabled: !hasChildren,
        },
      ],
    },
    { separator: true as const },
    { colorPicker: true as const, label: 'Color', colors: NODE_COLORS, currentColor: node.color || '', onSelectColor: (color: string) => setNodeColor(node.id, color) },
    { separator: true as const },
    {
      label: isBookmarked ? 'Remove Bookmark' : 'Bookmark',
      action: () => {
        if (isBookmarked) {
          useBookmarkStore.getState().remove(node.id);
        } else {
          const label = (node.content || '').replace(/<[^>]*>/g, '').trim() || 'Untitled';
          useBookmarkStore.getState().add(node.id, documentId ?? '', label);
        }
      },
    },
    { separator: true as const },
    {
      label: 'Delete',
      action: () => deleteNode(node.id),
      shortcut: 'Ctrl+Shift+Backspace',
    },
  ];
}
```

- [ ] **Step 2: Replace the useMemo in index.tsx**

In `outline-item/index.tsx`, add the import at the top:

```typescript
import { buildItemContextMenu } from './itemContextMenu';
```

Replace the `contextMenuItems` useMemo (lines 1264-1472 in the original, which starts with `const contextMenuItems = useMemo(() => [` and ends with `], [node.id, node.is_checked, ...]);`) with:

```typescript
  const contextMenuItems = useMemo(() => buildItemContextMenu({
    node, hasChildren, isBookmarked, documentId, plainTextContent, contextMenuPosition,
    toggleCheckbox, toggleNodeType, setNodeTypeTo, setHeadingLevel, clearHeading,
    toggleCollapse, zoomTo, zoomToParent, openNoteEditor, indentNode, outdentNode,
    deleteNode, setNodeColor, copyToClipboard, webSearch,
    setDatePickerPosition, setDatePickerMode, setShowDatePicker,
  }), [node.id, node.is_checked, node.node_type, node.heading_level, node.collapsed, node.date, node.date_end, node.defer_date, node.color, hasChildren, plainTextContent, toggleCheckbox, toggleNodeType, setNodeTypeTo, setHeadingLevel, clearHeading, toggleCollapse, zoomTo, openNoteEditor, indentNode, outdentNode, deleteNode, copyToClipboard, webSearch, contextMenuPosition, setNodeColor, isBookmarked, documentId]);
```

Remove the now-unused `NODE_COLORS` import from index.tsx if it's no longer used there (it may still be used by bulkContextMenu — check in Task 3).

- [ ] **Step 3: Run type check**

```bash
cd /home/andy/projects/outline/app && npm run check
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/andy/projects/outline
git add app/src/components/outline-item/itemContextMenu.ts app/src/components/outline-item/index.tsx
git commit -m "$(cat <<'EOF'
Extract itemContextMenu from OutlineItem

Pure function that builds the single-item context menu (40+ items).
No logic changes.
EOF
)"
```

---

### Task 3: Extract `bulkContextMenu.ts`

**Files:**
- Create: `app/src/components/outline-item/bulkContextMenu.ts`
- Modify: `app/src/components/outline-item/index.tsx`

- [ ] **Step 1: Create bulkContextMenu.ts**

Create `app/src/components/outline-item/bulkContextMenu.ts` with this content:

```typescript
import type { MenuItem } from '../ui/ContextMenu';
import type { Node } from '../../lib/types';
import { NODE_COLORS } from '../../lib/colorPalette';

interface BulkContextMenuParams {
  selectedNodes: Node[];
  // Store actions
  completeSelectedNodes: () => void;
  uncompleteSelectedNodes: () => void;
  convertSelectedToCheckbox: () => void;
  convertSelectedToBullet: () => void;
  convertSelectedToNumbered: () => void;
  moveSelectedToTop: () => void;
  moveSelectedToBottom: () => void;
  groupSelectedUnderNewParent: () => void;
  sortSelectedAlphabetical: () => void;
  sortSelectedReverseAlphabetical: () => void;
  sortSelectedByDate: () => void;
  sortSelectedByDateReverse: () => void;
  sortSelectedByCompletion: () => void;
  reverseSelectedOrder: () => void;
  indentSelectedNodes: () => void;
  outdentSelectedNodes: () => void;
  copySelectedAsMarkdown: () => void;
  copySelectedAsPlainText: () => void;
  exportSelectedToFile: () => void;
  exportSelectedToFilePlainText: () => void;
  deleteSelectedNodes: () => void;
  setSelectedNodesColor: (color: string) => void;
  onOpenBulkQuickMove?: () => void;
}

export function buildBulkContextMenu(params: BulkContextMenuParams): MenuItem[] {
  const {
    selectedNodes,
    completeSelectedNodes, uncompleteSelectedNodes,
    convertSelectedToCheckbox, convertSelectedToBullet, convertSelectedToNumbered,
    moveSelectedToTop, moveSelectedToBottom, groupSelectedUnderNewParent,
    sortSelectedAlphabetical, sortSelectedReverseAlphabetical,
    sortSelectedByDate, sortSelectedByDateReverse,
    sortSelectedByCompletion, reverseSelectedOrder,
    indentSelectedNodes, outdentSelectedNodes,
    copySelectedAsMarkdown, copySelectedAsPlainText,
    exportSelectedToFile, exportSelectedToFilePlainText,
    deleteSelectedNodes, setSelectedNodesColor, onOpenBulkQuickMove,
  } = params;

  const selectionCount = selectedNodes.length;
  const hasAnyUnchecked = selectedNodes.some(n => !n.is_checked || n.node_type !== 'checkbox');
  const hasAnyChecked = selectedNodes.some(n => n.is_checked && n.node_type === 'checkbox');
  const hasAnyBullet = selectedNodes.some(n => n.node_type === 'bullet');
  const hasAnyCheckbox = selectedNodes.some(n => n.node_type === 'checkbox');
  const hasAnyNonNumbered = selectedNodes.some(n => n.node_type !== 'numbered');

  return [
    {
      label: `Complete all (${selectionCount})`,
      action: completeSelectedNodes,
      shortcut: 'Ctrl+Enter',
      disabled: !hasAnyUnchecked,
    },
    {
      label: `Uncomplete all (${selectionCount})`,
      action: uncompleteSelectedNodes,
      disabled: !hasAnyChecked,
    },
    { separator: true as const },
    {
      label: 'Convert to checkbox',
      action: convertSelectedToCheckbox,
      disabled: !hasAnyBullet && !hasAnyNonNumbered,
    },
    {
      label: 'Convert to bullet',
      action: convertSelectedToBullet,
      disabled: !hasAnyCheckbox && !hasAnyNonNumbered,
    },
    {
      label: 'Convert to numbered',
      action: convertSelectedToNumbered,
      disabled: !hasAnyNonNumbered,
    },
    { separator: true as const },
    {
      submenu: true as const,
      label: 'Move',
      children: [
        {
          label: 'Move to...',
          action: () => onOpenBulkQuickMove?.(),
          shortcut: 'Ctrl+Shift+M',
          disabled: !onOpenBulkQuickMove,
        },
        {
          label: 'Move to top',
          action: moveSelectedToTop,
        },
        {
          label: 'Move to bottom',
          action: moveSelectedToBottom,
        },
        {
          label: 'Group under new item',
          action: groupSelectedUnderNewParent,
        },
      ],
    },
    {
      submenu: true as const,
      label: 'Sort',
      children: [
        {
          label: 'A-Z',
          action: sortSelectedAlphabetical,
        },
        {
          label: 'Z-A',
          action: sortSelectedReverseAlphabetical,
        },
        { separator: true as const },
        {
          label: 'By date (earliest)',
          action: sortSelectedByDate,
        },
        {
          label: 'By date (latest)',
          action: sortSelectedByDateReverse,
        },
        { separator: true as const },
        {
          label: 'By completion',
          action: sortSelectedByCompletion,
        },
        {
          label: 'Reverse order',
          action: reverseSelectedOrder,
        },
      ],
    },
    { separator: true as const },
    {
      label: 'Indent',
      action: indentSelectedNodes,
      shortcut: 'Tab',
    },
    {
      label: 'Outdent',
      action: outdentSelectedNodes,
      shortcut: 'Shift+Tab',
    },
    { separator: true as const },
    {
      submenu: true as const,
      label: 'Copy / Export',
      children: [
        {
          label: 'Copy as Markdown',
          action: copySelectedAsMarkdown,
          shortcut: 'Ctrl+Shift+C',
        },
        {
          label: 'Copy as Plain Text',
          action: copySelectedAsPlainText,
        },
        { separator: true as const },
        {
          label: 'Export as Markdown...',
          action: exportSelectedToFile,
        },
        {
          label: 'Export as Plain Text...',
          action: exportSelectedToFilePlainText,
        },
      ],
    },
    { separator: true as const },
    { colorPicker: true as const, label: 'Color', colors: NODE_COLORS, currentColor: '', onSelectColor: (color: string) => setSelectedNodesColor(color) },
    { separator: true as const },
    {
      label: `Delete selected (${selectionCount})`,
      action: deleteSelectedNodes,
      shortcut: 'Ctrl+Shift+Backspace',
    },
  ];
}
```

- [ ] **Step 2: Replace the useMemo in index.tsx**

Add the import:

```typescript
import { buildBulkContextMenu } from './bulkContextMenu';
```

Replace the `bulkContextMenuItems` useMemo (starts with `const bulkContextMenuItems = useMemo(() => {` through its closing `]);`) with:

```typescript
  const bulkContextMenuItems = useMemo(() => buildBulkContextMenu({
    selectedNodes: getSelectedNodes(),
    completeSelectedNodes, uncompleteSelectedNodes,
    convertSelectedToCheckbox, convertSelectedToBullet, convertSelectedToNumbered,
    moveSelectedToTop, moveSelectedToBottom, groupSelectedUnderNewParent,
    sortSelectedAlphabetical, sortSelectedReverseAlphabetical,
    sortSelectedByDate, sortSelectedByDateReverse,
    sortSelectedByCompletion, reverseSelectedOrder,
    indentSelectedNodes, outdentSelectedNodes,
    copySelectedAsMarkdown, copySelectedAsPlainText,
    exportSelectedToFile, exportSelectedToFilePlainText,
    deleteSelectedNodes, setSelectedNodesColor, onOpenBulkQuickMove,
  }), [selectedIds, getSelectedNodes, completeSelectedNodes, uncompleteSelectedNodes, convertSelectedToCheckbox, convertSelectedToBullet, convertSelectedToNumbered, moveSelectedToTop, moveSelectedToBottom, groupSelectedUnderNewParent, sortSelectedAlphabetical, sortSelectedReverseAlphabetical, sortSelectedByDate, sortSelectedByDateReverse, sortSelectedByCompletion, reverseSelectedOrder, copySelectedAsMarkdown, copySelectedAsPlainText, exportSelectedToFile, exportSelectedToFilePlainText, indentSelectedNodes, outdentSelectedNodes, deleteSelectedNodes, onOpenBulkQuickMove, setSelectedNodesColor]);
```

Now remove `NODE_COLORS` from the imports in index.tsx if it's no longer used there (both context menus now import it themselves). Keep `getColorCss` — it's still used for the item class building.

- [ ] **Step 3: Run type check**

```bash
cd /home/andy/projects/outline/app && npm run check
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/andy/projects/outline
git add app/src/components/outline-item/bulkContextMenu.ts app/src/components/outline-item/index.tsx
git commit -m "$(cat <<'EOF'
Extract bulkContextMenu from OutlineItem

Pure function that builds the multi-selection context menu (20+ items).
No logic changes.
EOF
)"
```

---

### Task 4: Extract `useDragDrop.ts`

**Files:**
- Create: `app/src/components/outline-item/useDragDrop.ts`
- Modify: `app/src/components/outline-item/index.tsx`

- [ ] **Step 1: Create useDragDrop.ts**

Create `app/src/components/outline-item/useDragDrop.ts`:

```typescript
import { useState, useCallback, DragEvent } from 'react';

interface UseDragDropParams {
  nodeId: string;
  draggedId: string | null;
  startDrag: (id: string) => void;
  endDrag: () => void;
  dropOnNode: (targetId: string, asChild: boolean) => void;
}

export function useDragDrop({ nodeId, draggedId, startDrag, endDrag, dropOnNode }: UseDragDropParams) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'child' | null>(null);

  const handleDragStart = useCallback((e: DragEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-outline-node', nodeId);
    }
    startDrag(nodeId);
  }, [nodeId, startDrag]);

  const handleDragEnd = useCallback((e: DragEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    endDrag();
    setIsDragOver(false);
    setDropPosition(null);
  }, [endDrag]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedId === nodeId) {
      return;
    }

    setIsDragOver(true);

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    if (y < height * 0.25) {
      setDropPosition('before');
    } else if (y > height * 0.75) {
      setDropPosition('after');
    } else {
      setDropPosition('child');
    }

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, [draggedId, nodeId]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDragOver(false);
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedId && draggedId !== nodeId) {
      if (dropPosition === 'child') {
        dropOnNode(nodeId, true);
      } else {
        dropOnNode(nodeId, false);
      }
    }

    setIsDragOver(false);
    setDropPosition(null);
  }, [draggedId, nodeId, dropPosition, dropOnNode]);

  return {
    isDragOver,
    dropPosition,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
```

- [ ] **Step 2: Use the hook in index.tsx**

Add the import:

```typescript
import { useDragDrop } from './useDragDrop';
```

Remove the `isDragOver` and `dropPosition` useState declarations (lines 142-143 in original).
Remove all 5 drag handler useCallbacks (`handleDragStart`, `handleDragEnd`, `handleDragOver`, `handleDragLeave`, `handleDrop`).

Add the hook call after the existing derived state (`isDragging`):

```typescript
  const isDragging = draggedId === node.id;
  const {
    isDragOver, dropPosition,
    handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop,
  } = useDragDrop({ nodeId: node.id, draggedId, startDrag, endDrag, dropOnNode });
```

- [ ] **Step 3: Run type check**

```bash
cd /home/andy/projects/outline/app && npm run check
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/andy/projects/outline
git add app/src/components/outline-item/useDragDrop.ts app/src/components/outline-item/index.tsx
git commit -m "$(cat <<'EOF'
Extract useDragDrop hook from OutlineItem

Encapsulates drag state (isDragOver, dropPosition) and all 5 drag
event handlers. No logic changes.
EOF
)"
```

---

### Task 5: Extract `useNoteEditor.ts`

**Files:**
- Create: `app/src/components/outline-item/useNoteEditor.ts`
- Modify: `app/src/components/outline-item/index.tsx`

- [ ] **Step 1: Create useNoteEditor.ts**

Create `app/src/components/outline-item/useNoteEditor.ts`:

```typescript
import { useState, useCallback, RefObject } from 'react';
import { Editor } from '@tiptap/core';
import DOMPurify from 'dompurify';

const NOTE_URL_PATTERN = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>[\]{}|\\^`"']+/g;

interface UseNoteEditorParams {
  nodeId: string;
  note: string | null | undefined;
  isFocused: boolean;
  noteInputRef: RefObject<HTMLTextAreaElement | null>;
  editorRef: RefObject<Editor | null>;
  updateNote: (id: string, note: string) => void;
  setFocusedId: (id: string) => void;
  openNoteEditor: (id: string) => void;
}

export function useNoteEditor({
  nodeId, note, isFocused, noteInputRef, editorRef,
  updateNote, setFocusedId, openNoteEditor,
}: UseNoteEditorParams) {
  const [isEditingNote, setIsEditingNote] = useState(false);

  const handleNoteInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNote(nodeId, e.target.value);
  }, [nodeId, updateNote]);

  const handleNoteKeydown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditingNote(false);
      editorRef.current?.commands.focus('end');
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      setIsEditingNote(false);
      editorRef.current?.commands.focus('end');
    }
  }, [editorRef]);

  const handleNoteBlur = useCallback(() => {
    if (!note?.trim()) {
      setIsEditingNote(false);
    }
  }, [note]);

  const renderNoteHtml = useCallback((text: string): string => {
    if (!text) return '';
    if (/<(?:p|h[1-3]|ul|ol|li|blockquote|pre|hr)\b/i.test(text)) {
      return DOMPurify.sanitize(text);
    }
    let result = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    result = result.replace(NOTE_URL_PATTERN, (url) => {
      const href = url.startsWith('www.') ? `https://${url}` : url;
      return `<a href="${href}" class="note-link" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    result = result.replace(/\n/g, '<br>');
    return result;
  }, []);

  const handleNoteClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A') {
      e.preventDefault();
      e.stopPropagation();
      const href = target.getAttribute('href');
      if (href) {
        window.open(href, '_blank');
      }
      return;
    }
    if (note && /<(?:p|h[1-3]|ul|ol|li|blockquote|pre|hr)\b/i.test(note)) {
      openNoteEditor(nodeId);
      return;
    }
    setFocusedId(nodeId);
    setIsEditingNote(true);
    setTimeout(() => noteInputRef.current?.focus(), 0);
  }, [nodeId, note, setFocusedId, openNoteEditor, noteInputRef]);

  return {
    isEditingNote,
    setIsEditingNote,
    handleNoteInput,
    handleNoteKeydown,
    handleNoteBlur,
    handleNoteClick,
    renderNoteHtml,
  };
}
```

- [ ] **Step 2: Use the hook in index.tsx**

Add the import:

```typescript
import { useNoteEditor } from './useNoteEditor';
```

Remove the `isEditingNote` useState, the `handleNoteInput`, `handleNoteKeydown`, `handleNoteBlur`, `renderNoteHtml`, `handleNoteClick` useCallbacks, and the `NOTE_URL_PATTERN` constant from index.tsx.

Add the hook call:

```typescript
  const {
    isEditingNote, setIsEditingNote,
    handleNoteInput, handleNoteKeydown, handleNoteBlur, handleNoteClick, renderNoteHtml,
  } = useNoteEditor({
    nodeId: node.id, note: node.note, isFocused,
    noteInputRef, editorRef,
    updateNote, setFocusedId, openNoteEditor,
  });
```

Note: `setIsEditingNote` is still needed in the editor's Shift+Enter handler inside the TipTap useEffect. It's returned from the hook so it can be used there.

- [ ] **Step 3: Run type check**

```bash
cd /home/andy/projects/outline/app && npm run check
```

Expected: No errors.

- [ ] **Step 4: Run Playwright tests**

```bash
cd /home/andy/projects/outline/app && npx playwright test --reporter=line 2>&1 | tail -5
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/andy/projects/outline
git add app/src/components/outline-item/useNoteEditor.ts app/src/components/outline-item/index.tsx
git commit -m "$(cat <<'EOF'
Extract useNoteEditor hook from OutlineItem

Encapsulates note editing state and all 5 note handlers.
No logic changes.
EOF
)"
```

---

### Task 6: Extract `useSuggestions.ts`

**Files:**
- Create: `app/src/components/outline-item/useSuggestions.ts`
- Modify: `app/src/components/outline-item/index.tsx`

- [ ] **Step 1: Create useSuggestions.ts**

This hook encapsulates the 4 suggestion popup state/ref/handler groups and the date/recurrence picker handlers.

Create `app/src/components/outline-item/useSuggestions.ts`:

```typescript
import { useState, useCallback, useRef, RefObject } from 'react';
import { Editor } from '@tiptap/core';
import { useOutlineStore } from '../../store/outlineStore';
import type { DatePickerMode } from '../ui/DatePicker';
import type { RecurrenceMode } from '../ui/RecurrencePicker';

type Position = { x: number; y: number };
type Range = { from: number; to: number };

export interface SuggestionState {
  show: boolean;
  query: string;
  range: Range | null;
  position: Position;
}

/** Refs and setters passed to the editor for trigger detection */
export interface SuggestionControls {
  wikiLink: {
    activeRef: React.RefObject<boolean>;
    rangeRef: React.RefObject<Range | null>;
    setShow: (v: boolean) => void;
    setQuery: (v: string) => void;
    setRange: (v: Range | null) => void;
    setPosition: (v: Position) => void;
  };
  hashtag: {
    activeRef: React.RefObject<boolean>;
    rangeRef: React.RefObject<Range | null>;
    setShow: (v: boolean) => void;
    setQuery: (v: string) => void;
    setRange: (v: Range | null) => void;
    setPosition: (v: Position) => void;
  };
  dueDate: {
    activeRef: React.RefObject<boolean>;
    rangeRef: React.RefObject<Range | null>;
    setShow: (v: boolean) => void;
    setQuery: (v: string) => void;
    setRange: (v: Range | null) => void;
    setPosition: (v: Position) => void;
  };
  emoji: {
    activeRef: React.RefObject<boolean>;
    rangeRef: React.RefObject<Range | null>;
    setShow: (v: boolean) => void;
    setQuery: (v: string) => void;
    setRange: (v: Range | null) => void;
    setPosition: (v: Position) => void;
  };
  datePicker: {
    setShow: (v: boolean) => void;
    setPosition: (v: Position) => void;
    setMode: (v: DatePickerMode) => void;
  };
  recurrencePicker: {
    setShow: (v: boolean) => void;
    setPosition: (v: Position) => void;
  };
}

interface UseSuggestionsParams {
  editorRef: RefObject<Editor | null>;
  nodeId: string;
}

export function useSuggestions({ editorRef, nodeId }: UseSuggestionsParams) {
  // Wiki link
  const [showWikiLinkSuggestion, setShowWikiLinkSuggestion] = useState(false);
  const [wikiLinkQuery, setWikiLinkQuery] = useState('');
  const [wikiLinkRange, setWikiLinkRange] = useState<Range | null>(null);
  const [wikiLinkPosition, setWikiLinkPosition] = useState<Position>({ x: 0, y: 0 });
  const wikiLinkActiveRef = useRef(false);
  const wikiLinkRangeRef = useRef<Range | null>(null);

  // Hashtag
  const [showHashtagSuggestion, setShowHashtagSuggestion] = useState(false);
  const [hashtagQuery, setHashtagQuery] = useState('');
  const [hashtagRange, setHashtagRange] = useState<Range | null>(null);
  const [hashtagPosition, setHashtagPosition] = useState<Position>({ x: 0, y: 0 });
  const hashtagActiveRef = useRef(false);
  const hashtagRangeRef = useRef<Range | null>(null);

  // Due date
  const [showDueDateSuggestion, setShowDueDateSuggestion] = useState(false);
  const [dueDateQuery, setDueDateQuery] = useState('');
  const [dueDateRange, setDueDateRange] = useState<Range | null>(null);
  const [dueDatePosition, setDueDatePosition] = useState<Position>({ x: 0, y: 0 });
  const dueDateActiveRef = useRef(false);
  const dueDateRangeRef = useRef<Range | null>(null);

  // Emoji
  const [showEmojiSuggestion, setShowEmojiSuggestion] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [emojiRange, setEmojiRange] = useState<Range | null>(null);
  const [emojiPosition, setEmojiPosition] = useState<Position>({ x: 0, y: 0 });
  const emojiActiveRef = useRef(false);
  const emojiRangeRef = useRef<Range | null>(null);

  // Date picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState<Position>({ x: 0, y: 0 });
  const [datePickerMode, setDatePickerMode] = useState<DatePickerMode>('due');

  // Recurrence picker
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const [recurrencePickerPosition, setRecurrencePickerPosition] = useState<Position>({ x: 0, y: 0 });

  // === Select/Close handlers ===

  const handleWikiLinkSelect = useCallback((selectedNodeId: string, displayText: string) => {
    const editor = editorRef.current;
    const range = wikiLinkRangeRef.current;
    if (!editor || !range) return;

    editor.chain().focus().deleteRange(range).insertWikiLink(selectedNodeId, displayText).run();

    wikiLinkActiveRef.current = false;
    wikiLinkRangeRef.current = null;
    setShowWikiLinkSuggestion(false);
    setWikiLinkRange(null);
  }, [editorRef]);

  const handleWikiLinkClose = useCallback(() => {
    wikiLinkActiveRef.current = false;
    wikiLinkRangeRef.current = null;
    setShowWikiLinkSuggestion(false);
    setWikiLinkRange(null);
  }, []);

  const handleHashtagSelect = useCallback((tag: string) => {
    const editor = editorRef.current;
    const range = hashtagRangeRef.current;
    if (!editor || !range) return;

    editor.chain().focus().deleteRange(range).insertContent(`#${tag} `).run();

    hashtagActiveRef.current = false;
    hashtagRangeRef.current = null;
    setShowHashtagSuggestion(false);
    setHashtagRange(null);
  }, [editorRef]);

  const handleHashtagClose = useCallback(() => {
    hashtagActiveRef.current = false;
    hashtagRangeRef.current = null;
    setShowHashtagSuggestion(false);
    setHashtagRange(null);
  }, []);

  const handleDueDateSelect = useCallback((date: string) => {
    const editor = editorRef.current;
    const range = dueDateRangeRef.current;
    if (!editor || !range) return;

    editor.chain().focus().deleteRange(range).insertContent(`!(${date})`).run();

    dueDateActiveRef.current = false;
    dueDateRangeRef.current = null;
    setShowDueDateSuggestion(false);
    setDueDateRange(null);
  }, [editorRef]);

  const handleDueDateClose = useCallback(() => {
    dueDateActiveRef.current = false;
    dueDateRangeRef.current = null;
    setShowDueDateSuggestion(false);
    setDueDateRange(null);
  }, []);

  const handleEmojiSelect = useCallback((shortcode: string, emoji: string, imageUrl?: string) => {
    const editor = editorRef.current;
    const range = emojiRangeRef.current;
    if (!editor || !range) return;

    if (imageUrl) {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'customEmoji',
        attrs: { src: imageUrl, alt: `:${shortcode}:`, shortcode },
      }).run();
    } else {
      editor.chain().focus().deleteRange(range).insertContent(emoji).run();
    }

    emojiActiveRef.current = false;
    emojiRangeRef.current = null;
    setShowEmojiSuggestion(false);
    setEmojiRange(null);
  }, [editorRef]);

  const handleEmojiClose = useCallback(() => {
    emojiActiveRef.current = false;
    emojiRangeRef.current = null;
    setShowEmojiSuggestion(false);
    setEmojiRange(null);
  }, []);

  // === Date picker handlers ===

  const handleDateSelect = useCallback(async (date: string | null, pickerMode: DatePickerMode) => {
    setShowDatePicker(false);
    const api = await import('../../lib/api');
    if (pickerMode === 'defer') {
      await api.updateNode(nodeId, { defer_date: date || '' });
    } else if (pickerMode === 'end') {
      await api.updateNode(nodeId, { date_end: date || '' });
    } else {
      await api.updateNode(nodeId, { date: date || '' });
    }
    const state = await api.loadDocument();
    useOutlineStore.getState().updateFromState(state);
  }, [nodeId]);

  const handleDatePickerClose = useCallback(() => {
    setShowDatePicker(false);
  }, []);

  const handleDateBadgeClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDatePickerPosition({ x: rect.left, y: rect.bottom + 5 });
    setDatePickerMode('due');
    setShowDatePicker(true);
  }, []);

  const handleDeferBadgeClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDatePickerPosition({ x: rect.left, y: rect.bottom + 5 });
    setDatePickerMode('defer');
    setShowDatePicker(true);
  }, []);

  // === Recurrence picker handlers ===

  const handleRecurrenceSelect = useCallback(async (rrule: string | null, mode: RecurrenceMode) => {
    setShowRecurrencePicker(false);
    const api = await import('../../lib/api');
    const changes: Record<string, string | undefined> = {
      recurrence: rrule || undefined,
    };
    if (rrule == null) {
      changes.recurrence_mode = '';
    } else {
      changes.recurrence_mode = mode === 'complete' ? 'complete' : '';
    }
    await api.updateNode(nodeId, changes);
    const state = await api.loadDocument();
    useOutlineStore.getState().updateFromState(state);
  }, [nodeId]);

  const handleRecurrencePickerClose = useCallback(() => {
    setShowRecurrencePicker(false);
  }, []);

  const handleRecurrenceIndicatorClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setRecurrencePickerPosition({ x: rect.left, y: rect.bottom + 5 });
    setShowRecurrencePicker(true);
  }, []);

  // Controls object for the editor hook to use for trigger detection
  const controls: SuggestionControls = {
    wikiLink: {
      activeRef: wikiLinkActiveRef,
      rangeRef: wikiLinkRangeRef,
      setShow: setShowWikiLinkSuggestion,
      setQuery: setWikiLinkQuery,
      setRange: setWikiLinkRange,
      setPosition: setWikiLinkPosition,
    },
    hashtag: {
      activeRef: hashtagActiveRef,
      rangeRef: hashtagRangeRef,
      setShow: setShowHashtagSuggestion,
      setQuery: setHashtagQuery,
      setRange: setHashtagRange,
      setPosition: setHashtagPosition,
    },
    dueDate: {
      activeRef: dueDateActiveRef,
      rangeRef: dueDateRangeRef,
      setShow: setShowDueDateSuggestion,
      setQuery: setDueDateQuery,
      setRange: setDueDateRange,
      setPosition: setDueDatePosition,
    },
    emoji: {
      activeRef: emojiActiveRef,
      rangeRef: emojiRangeRef,
      setShow: setShowEmojiSuggestion,
      setQuery: setEmojiQuery,
      setRange: setEmojiRange,
      setPosition: setEmojiPosition,
    },
    datePicker: {
      setShow: setShowDatePicker,
      setPosition: setDatePickerPosition,
      setMode: setDatePickerMode,
    },
    recurrencePicker: {
      setShow: setShowRecurrencePicker,
      setPosition: setRecurrencePickerPosition,
    },
  };

  return {
    // Suggestion popup state
    wikiLink: {
      show: showWikiLinkSuggestion, query: wikiLinkQuery, position: wikiLinkPosition,
      onSelect: handleWikiLinkSelect, onClose: handleWikiLinkClose,
    },
    hashtag: {
      show: showHashtagSuggestion, query: hashtagQuery, position: hashtagPosition,
      onSelect: handleHashtagSelect, onClose: handleHashtagClose,
    },
    dueDate: {
      show: showDueDateSuggestion, query: dueDateQuery, position: dueDatePosition,
      onSelect: handleDueDateSelect, onClose: handleDueDateClose,
    },
    emoji: {
      show: showEmojiSuggestion, query: emojiQuery, position: emojiPosition,
      onSelect: handleEmojiSelect, onClose: handleEmojiClose,
    },
    // Date/recurrence picker state
    datePicker: {
      show: showDatePicker, position: datePickerPosition, mode: datePickerMode,
      onSelect: handleDateSelect, onClose: handleDatePickerClose,
      onDateBadgeClick: handleDateBadgeClick, onDeferBadgeClick: handleDeferBadgeClick,
    },
    recurrencePicker: {
      show: showRecurrencePicker, position: recurrencePickerPosition,
      onSelect: handleRecurrenceSelect, onClose: handleRecurrencePickerClose,
      onIndicatorClick: handleRecurrenceIndicatorClick,
    },
    // Controls for editor trigger detection
    controls,
  };
}
```

- [ ] **Step 2: Use the hook in index.tsx**

Add the import:

```typescript
import { useSuggestions } from './useSuggestions';
```

Remove from index.tsx:
- All 16 suggestion useState declarations (showWikiLinkSuggestion through emojiRangeRef)
- All 8 suggestion useRef declarations
- All date/recurrence picker useState declarations (showDatePicker through recurrencePickerPosition)
- All select/close handler useCallbacks (handleWikiLinkSelect through handleRecurrenceIndicatorClick)
- The `DatePickerMode` and `RecurrenceMode` type imports (moved to the hook)

Add the hook call:

```typescript
  const suggestions = useSuggestions({ editorRef, nodeId: node.id });
```

Update the JSX to use the returned values. For example, change:
```tsx
{showWikiLinkSuggestion && (
  <WikiLinkSuggestion query={wikiLinkQuery} position={wikiLinkPosition}
    onSelect={handleWikiLinkSelect} onClose={handleWikiLinkClose} />
)}
```
to:
```tsx
{suggestions.wikiLink.show && (
  <WikiLinkSuggestion query={suggestions.wikiLink.query} position={suggestions.wikiLink.position}
    onSelect={suggestions.wikiLink.onSelect} onClose={suggestions.wikiLink.onClose} />
)}
```

Apply the same pattern to all 4 suggestion popups and the date/recurrence pickers:

```tsx
{suggestions.hashtag.show && (
  <HashtagSuggestion query={suggestions.hashtag.query} position={suggestions.hashtag.position}
    onSelect={suggestions.hashtag.onSelect} onClose={suggestions.hashtag.onClose}
    existingTags={existingTags} />
)}
{suggestions.dueDate.show && (
  <DueDateSuggestion query={suggestions.dueDate.query} position={suggestions.dueDate.position}
    onSelect={suggestions.dueDate.onSelect} onClose={suggestions.dueDate.onClose} />
)}
{suggestions.emoji.show && (
  <EmojiSuggestion query={suggestions.emoji.query} position={suggestions.emoji.position}
    onSelect={suggestions.emoji.onSelect} onClose={suggestions.emoji.onClose} />
)}
{suggestions.datePicker.show && (
  <DatePicker position={suggestions.datePicker.position}
    currentDate={node.date} currentDeferDate={node.defer_date} currentDateEnd={node.date_end}
    initialMode={suggestions.datePicker.mode}
    onSelect={suggestions.datePicker.onSelect} onClose={suggestions.datePicker.onClose} />
)}
{suggestions.recurrencePicker.show && (
  <RecurrencePicker position={suggestions.recurrencePicker.position}
    currentRecurrence={node.recurrence}
    currentMode={(node.recurrence_mode as RecurrenceMode) ?? 'schedule'}
    onSelect={suggestions.recurrencePicker.onSelect} onClose={suggestions.recurrencePicker.onClose} />
)}
```

Update the date/defer badge and recurrence indicator click handlers in the JSX:
```tsx
<span className="date-badge defer" onClick={suggestions.datePicker.onDeferBadgeClick} ...>
<span className="date-badge" onClick={suggestions.datePicker.onDateBadgeClick} ...>
<span className="recurrence-indicator" onClick={suggestions.recurrencePicker.onIndicatorClick} ...>
```

Update `buildItemContextMenu` call to pass the date picker openers from suggestions:
```typescript
setDatePickerPosition: suggestions.controls.datePicker.setPosition,
setDatePickerMode: suggestions.controls.datePicker.setMode,
setShowDatePicker: suggestions.controls.datePicker.setShow,
```

Note: The `RecurrenceMode` type import is still needed in index.tsx for the RecurrencePicker JSX prop cast `(node.recurrence_mode as RecurrenceMode)`. Keep that import.

- [ ] **Step 3: Run type check**

```bash
cd /home/andy/projects/outline/app && npm run check
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/andy/projects/outline
git add app/src/components/outline-item/useSuggestions.ts app/src/components/outline-item/index.tsx
git commit -m "$(cat <<'EOF'
Extract useSuggestions hook from OutlineItem

Encapsulates all 4 suggestion popup state/handlers (wiki link, hashtag,
due date, emoji) plus date and recurrence picker handlers.
Exports a controls object for the editor to use for trigger detection.
No logic changes.
EOF
)"
```

---

### Task 7: Extract `useOutlineEditor.ts`

This is the largest extraction — the 717-line TipTap editor useEffect. It depends on `suggestions.controls` from Task 6.

**Files:**
- Create: `app/src/components/outline-item/useOutlineEditor.ts`
- Modify: `app/src/components/outline-item/index.tsx`

- [ ] **Step 1: Create useOutlineEditor.ts**

Create `app/src/components/outline-item/useOutlineEditor.ts`. This file contains the entire editor creation useEffect, extracted as a custom hook.

The hook takes refs and callbacks, returns `editorRef` and `editorReady`:

```typescript
import { useRef, useState, useEffect, RefObject } from 'react';
import { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { WikiLink } from '../../lib/WikiLink';
import { Hashtag } from '../../lib/Hashtag';
import { DueDate } from '../../lib/DueDate';
import { AutoLink } from '../../lib/AutoLink';
import { MarkdownLink } from '../../lib/MarkdownLink';
import { Mention } from '../../lib/Mention';
import { EmojiShortcode } from '../../lib/EmojiShortcode';
import { CustomEmojiNode } from '../../lib/CustomEmojiNode';
import { useOutlineStore } from '../../store/outlineStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { looksLikeMarkdownList, parseMarkdownList } from '../../lib/markdownPaste';
import type { Node } from '../../lib/types';
import type { SuggestionControls } from './useSuggestions';

interface StoreActions {
  addSiblingAfter: (id: string) => void;
  deleteNode: (id: string, direction?: string) => void;
  updateContent: (id: string, content: string) => void;
  toggleCollapse: (id: string) => void;
  toggleCheckbox: (id: string) => void;
  toggleNodeType: (id: string) => void;
  setHeadingLevel: (id: string, level: number) => void;
  clearHeading: (id: string) => void;
  indentNode: (id: string) => void;
  outdentNode: (id: string) => void;
  swapWithPrevious: (id: string) => void;
  swapWithNext: (id: string) => void;
  moveToPrevious: () => void;
  moveToNext: () => void;
  moveToFirst: () => void;
  moveToLast: () => void;
  setFocusedId: (id: string) => void;
}

export type { StoreActions };

interface UseOutlineEditorParams {
  nodeId: string;
  node: Node;
  content: string;
  isFocused: boolean;
  editorContainerRef: RefObject<HTMLDivElement | null>;
  storeRef: RefObject<StoreActions>;
  suggestions: SuggestionControls;
  onNavigateToNode?: (nodeId: string) => void;
  setIsEditingNote: (v: boolean) => void;
  noteInputRef: RefObject<HTMLTextAreaElement | null>;
  editorContainerRefForPicker: RefObject<HTMLDivElement | null>;
  zoomToParent: () => void;
}

export function useOutlineEditor({
  nodeId, node, content, isFocused, editorContainerRef, storeRef, suggestions,
  onNavigateToNode, setIsEditingNote, noteInputRef, editorContainerRefForPicker, zoomToParent,
}: UseOutlineEditorParams) {
  const editorRef = useRef<Editor | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    if (isFocused && editorContainerRef.current && !editorRef.current) {
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
          WikiLink.configure({
            onNavigate: (targetNodeId: string) => {
              if (onNavigateToNode) {
                onNavigateToNode(targetNodeId);
              }
            },
          }),
          Hashtag.configure({
            onHashtagClick: (tag: string) => {
              useOutlineStore.getState().setFilterQuery(`#${tag}`);
            },
          }),
          DueDate.configure({
            onDueDateClick: (date: string) => {
              console.log('Due date clicked:', date);
            },
          }),
          AutoLink.configure({
            openOnClick: true,
          }),
          MarkdownLink.configure({
            openOnClick: true,
          }),
          Mention.configure({
            onMentionClick: (mention: string) => {
              useOutlineStore.getState().setFilterQuery(`@${mention}`);
            },
          }),
          EmojiShortcode,
          CustomEmojiNode,
        ],
        content: content || '',
        editorProps: {
          attributes: {
            class: 'outline-editor',
          },
          handleTextInput: (view, from, to, text) => {
            const state = view.state;
            const prevChar = from > 0 ? state.doc.textBetween(from - 1, from) : '';

            // Detect [[ trigger for wiki links
            if (text === '[' && prevChar === '[') {
              const coords = view.coordsAtPos(from);
              suggestions.wikiLink.activeRef.current = true;
              suggestions.wikiLink.rangeRef.current = { from: from - 1, to: from + 1 };
              suggestions.wikiLink.setShow(true);
              suggestions.wikiLink.setQuery('');
              suggestions.wikiLink.setRange({ from: from - 1, to: from + 1 });
              suggestions.wikiLink.setPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            if (suggestions.wikiLink.activeRef.current && suggestions.wikiLink.rangeRef.current) {
              const range = suggestions.wikiLink.rangeRef.current;
              const queryStart = range.from + 2;
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              if (text === ']' && currentQuery.endsWith(']')) {
                suggestions.wikiLink.activeRef.current = false;
                suggestions.wikiLink.rangeRef.current = null;
                suggestions.wikiLink.setShow(false);
                suggestions.wikiLink.setRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              suggestions.wikiLink.rangeRef.current = newRange;
              suggestions.wikiLink.setQuery(currentQuery);
              suggestions.wikiLink.setRange(newRange);
              return false;
            }

            // Detect # trigger for hashtags
            if (text === '#' && (prevChar === '' || prevChar === ' ' || prevChar === '\t' || from === 1)) {
              const coords = view.coordsAtPos(from);
              suggestions.hashtag.activeRef.current = true;
              suggestions.hashtag.rangeRef.current = { from: from, to: from + 1 };
              suggestions.hashtag.setShow(true);
              suggestions.hashtag.setQuery('');
              suggestions.hashtag.setRange({ from: from, to: from + 1 });
              suggestions.hashtag.setPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            if (suggestions.hashtag.activeRef.current && suggestions.hashtag.rangeRef.current) {
              const range = suggestions.hashtag.rangeRef.current;
              const queryStart = range.from + 1;
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              if (text === ' ' || text === '\t' || text === '\n') {
                suggestions.hashtag.activeRef.current = false;
                suggestions.hashtag.rangeRef.current = null;
                suggestions.hashtag.setShow(false);
                suggestions.hashtag.setRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              suggestions.hashtag.rangeRef.current = newRange;
              suggestions.hashtag.setQuery(currentQuery);
              suggestions.hashtag.setRange(newRange);
              return false;
            }

            // Detect !( trigger for due dates
            if (text === '(' && prevChar === '!') {
              const coords = view.coordsAtPos(from);
              suggestions.dueDate.activeRef.current = true;
              suggestions.dueDate.rangeRef.current = { from: from - 1, to: from + 1 };
              suggestions.dueDate.setShow(true);
              suggestions.dueDate.setQuery('');
              suggestions.dueDate.setRange({ from: from - 1, to: from + 1 });
              suggestions.dueDate.setPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            if (suggestions.dueDate.activeRef.current && suggestions.dueDate.rangeRef.current) {
              const range = suggestions.dueDate.rangeRef.current;
              const queryStart = range.from + 2;
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              if (text === ')') {
                suggestions.dueDate.activeRef.current = false;
                suggestions.dueDate.rangeRef.current = null;
                suggestions.dueDate.setShow(false);
                suggestions.dueDate.setRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              suggestions.dueDate.rangeRef.current = newRange;
              suggestions.dueDate.setQuery(currentQuery);
              suggestions.dueDate.setRange(newRange);
              return false;
            }

            // Detect : trigger for emoji
            if (text === ':' && !suggestions.emoji.activeRef.current &&
                (prevChar === '' || prevChar === ' ' || prevChar === '\t' || from === 1)) {
              const coords = view.coordsAtPos(from);
              suggestions.emoji.activeRef.current = true;
              suggestions.emoji.rangeRef.current = { from: from, to: from + 1 };
              suggestions.emoji.setShow(true);
              suggestions.emoji.setQuery('');
              suggestions.emoji.setRange({ from: from, to: from + 1 });
              suggestions.emoji.setPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            if (suggestions.emoji.activeRef.current && suggestions.emoji.rangeRef.current) {
              const range = suggestions.emoji.rangeRef.current;
              const queryStart = range.from + 1;
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              if (text === ' ' || text === '\t' || text === '\n' || text === ':') {
                suggestions.emoji.activeRef.current = false;
                suggestions.emoji.rangeRef.current = null;
                suggestions.emoji.setShow(false);
                suggestions.emoji.setRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              suggestions.emoji.rangeRef.current = newRange;
              suggestions.emoji.setQuery(currentQuery);
              suggestions.emoji.setRange(newRange);
              return false;
            }

            // Auto-convert [ ] or [x] to checkbox
            if (text === ' ') {
              const docText = state.doc.textContent;
              const textBeforeCursor = docText.substring(0, from - 1);

              if (textBeforeCursor === '[ ]' || textBeforeCursor === '[x]' ||
                  textBeforeCursor === '[X]') {
                const isChecked = textBeforeCursor.toLowerCase() === '[x]';
                useOutlineStore.getState().convertToCheckbox(nodeId, isChecked);
                return true;
              }
            }

            return false;
          },
          handleKeyDown: (view, event) => {
            const mod = event.ctrlKey || event.metaKey;
            const store = storeRef.current;

            // When suggestion is active, let Enter/Tab/Arrow pass through
            if (suggestions.wikiLink.activeRef.current || suggestions.hashtag.activeRef.current ||
                suggestions.dueDate.activeRef.current || suggestions.emoji.activeRef.current) {
              if (event.key === 'Enter' || event.key === 'Tab' ||
                  event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                return false;
              }
            }

            // === TAB HANDLING ===
            if (event.key === 'Tab') {
              event.preventDefault();
              event.stopPropagation();
              if (event.shiftKey) {
                store.outdentNode(nodeId);
              } else {
                store.indentNode(nodeId);
              }
              return true;
            }

            // === NOTE EDITING ===
            if (event.key === 'Enter' && !mod && event.shiftKey) {
              event.preventDefault();
              setIsEditingNote(true);
              setTimeout(() => noteInputRef.current?.focus(), 0);
              return true;
            }

            // === EDITING ===
            if (event.key === 'Enter' && !mod && !event.shiftKey) {
              event.preventDefault();
              const { from, to, empty } = view.state.selection;
              const docSize = view.state.doc.content.size;
              const isAtEnd = to >= docSize - 1;

              if (isAtEnd) {
                const currentNode = useOutlineStore.getState().getNode(nodeId);
                const nodeChildren = useOutlineStore.getState().childrenOf(nodeId);
                if (nodeChildren.length > 0 && !currentNode?.collapsed) {
                  useOutlineStore.getState().createFirstChild(nodeId);
                } else {
                  store.addSiblingAfter(nodeId);
                }
              } else {
                const beforeFragment = view.state.doc.slice(0, from);
                const afterFragment = view.state.doc.slice(from, docSize);
                const serializer = DOMSerializer.fromSchema(view.state.schema);
                const beforeDiv = document.createElement('div');
                const afterDiv = document.createElement('div');
                beforeDiv.appendChild(serializer.serializeFragment(beforeFragment.content));
                afterDiv.appendChild(serializer.serializeFragment(afterFragment.content));
                const beforeContent = beforeDiv.innerHTML;
                const afterContent = afterDiv.innerHTML;
                useOutlineStore.getState().splitNode(nodeId, beforeContent, afterContent);
              }
              return true;
            }

            if (event.key === 'Backspace' && mod && event.shiftKey) {
              event.preventDefault();
              store.deleteNode(nodeId);
              return true;
            }

            if (event.key === 'Backspace' && !mod && !event.shiftKey) {
              const { from } = view.state.selection;
              const isEmpty = view.state.doc.textContent.length === 0;
              if (from === 1) {
                if (isEmpty) {
                  event.preventDefault();
                  store.deleteNode(nodeId);
                  return true;
                } else {
                  event.preventDefault();
                  useOutlineStore.getState().mergeWithPreviousSibling(nodeId);
                  return true;
                }
              }
            }

            if (event.key === 'Delete' && !mod && !event.shiftKey) {
              const { to } = view.state.selection;
              const docSize = view.state.doc.content.size;
              const isEmpty = view.state.doc.textContent.length === 0;
              if (isEmpty) {
                event.preventDefault();
                store.deleteNode(nodeId, 'next');
                return true;
              }
              const isAtEnd = to >= docSize - 1;
              if (isAtEnd) {
                event.preventDefault();
                useOutlineStore.getState().mergeWithNextSibling(nodeId);
                return true;
              }
            }

            // === NAVIGATION ===
            if (event.key === 'ArrowUp' && !mod && !event.shiftKey) {
              event.preventDefault();
              store.moveToPrevious();
              return true;
            }

            if (event.key === 'ArrowDown' && !mod && !event.shiftKey) {
              event.preventDefault();
              store.moveToNext();
              return true;
            }

            if (event.key === 'ArrowUp' && mod) {
              event.preventDefault();
              store.swapWithPrevious(nodeId);
              return true;
            }

            if (event.key === 'ArrowDown' && mod) {
              event.preventDefault();
              store.swapWithNext(nodeId);
              return true;
            }

            if (event.key === 'Home' && mod) {
              event.preventDefault();
              store.moveToFirst();
              return true;
            }

            if (event.key === 'End' && mod) {
              event.preventDefault();
              store.moveToLast();
              return true;
            }

            // === COLLAPSE/EXPAND ===
            if (event.key === '.' && mod) {
              event.preventDefault();
              store.toggleCollapse(nodeId);
              return true;
            }

            // === ZOOM ===
            if (event.key === ']' && mod) {
              event.preventDefault();
              useOutlineStore.getState().zoomTo(nodeId);
              return true;
            }

            if (event.key === '[' && mod) {
              event.preventDefault();
              zoomToParent();
              return true;
            }

            // === DATE PICKER ===
            if (event.key === 'd' && mod && !event.shiftKey) {
              event.preventDefault();
              const rect = editorContainerRefForPicker.current?.getBoundingClientRect();
              if (rect) {
                suggestions.datePicker.setPosition({ x: rect.left, y: rect.bottom + 5 });
              }
              suggestions.datePicker.setMode('due');
              suggestions.datePicker.setShow(true);
              return true;
            }

            if ((event.key === 'D' || event.key === 'd') && mod && event.shiftKey) {
              event.preventDefault();
              const rect = editorContainerRefForPicker.current?.getBoundingClientRect();
              if (rect) {
                suggestions.datePicker.setPosition({ x: rect.left, y: rect.bottom + 5 });
              }
              suggestions.datePicker.setMode('defer');
              suggestions.datePicker.setShow(true);
              return true;
            }

            // Ctrl+R : open recurrence picker
            if (event.key === 'r' && mod && !event.shiftKey) {
              event.preventDefault();
              const rect = editorContainerRefForPicker.current?.getBoundingClientRect();
              if (rect) {
                suggestions.recurrencePicker.setPosition({ x: rect.left, y: rect.bottom + 5 });
              }
              suggestions.recurrencePicker.setShow(true);
              return true;
            }

            // === COMPLETION ===
            if (event.key === 'Enter' && mod && !event.shiftKey) {
              if (useSelectionStore.getState().selectedIds.size > 0) {
                return false;
              }
              event.preventDefault();
              const { getVisibleNodes } = useOutlineStore.getState();
              const visible = getVisibleNodes();
              const idx = visible.findIndex(n => n.id === nodeId);
              const nextId = idx >= 0 && idx < visible.length - 1 ? visible[idx + 1].id
                           : idx > 0 ? visible[idx - 1].id
                           : null;
              store.toggleCheckbox(nodeId);
              if (nextId) {
                store.setFocusedId(nextId);
              }
              return true;
            }

            if (event.key.toLowerCase() === 'x' && mod && event.shiftKey) {
              event.preventDefault();
              store.toggleNodeType(nodeId);
              return true;
            }

            // === HEADING LEVELS ===
            if (mod && !event.shiftKey && event.key >= '1' && event.key <= '6') {
              event.preventDefault();
              store.setHeadingLevel(nodeId, parseInt(event.key, 10));
              return true;
            }

            if (mod && !event.shiftKey && event.key === '0') {
              event.preventDefault();
              store.clearHeading(nodeId);
              return true;
            }

            // === EXPORT SELECTION ===
            if (event.key.toLowerCase() === 'e' && mod && event.shiftKey) {
              event.preventDefault();
              useSelectionStore.getState().exportSelection();
              return true;
            }

            // === WEB SEARCH ===
            if (event.key.toLowerCase() === 'g' && mod && event.shiftKey) {
              event.preventDefault();
              const selection = window.getSelection();
              let searchText = selection?.toString()?.trim();
              if (!searchText) {
                searchText = useOutlineStore.getState().getNode(nodeId)?.content?.replace(/<[^>]*>/g, '').trim() || '';
              }
              if (searchText) {
                const url = useSettingsStore.getState().buildSearchUrl(searchText);
                window.open(url, '_blank');
              }
              return true;
            }

            // === SUGGESTION ESCAPE/BACKSPACE HANDLING ===
            if (suggestions.wikiLink.activeRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                suggestions.wikiLink.activeRef.current = false;
                suggestions.wikiLink.rangeRef.current = null;
                suggestions.wikiLink.setShow(false);
                suggestions.wikiLink.setRange(null);
                return true;
              }
              if (event.key === 'Backspace' && suggestions.wikiLink.rangeRef.current) {
                const { from } = view.state.selection;
                if (from <= suggestions.wikiLink.rangeRef.current.from + 2) {
                  suggestions.wikiLink.activeRef.current = false;
                  suggestions.wikiLink.rangeRef.current = null;
                  suggestions.wikiLink.setShow(false);
                  suggestions.wikiLink.setRange(null);
                }
              }
            }

            if (suggestions.hashtag.activeRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                suggestions.hashtag.activeRef.current = false;
                suggestions.hashtag.rangeRef.current = null;
                suggestions.hashtag.setShow(false);
                suggestions.hashtag.setRange(null);
                return true;
              }
              if (event.key === 'Backspace' && suggestions.hashtag.rangeRef.current) {
                const { from } = view.state.selection;
                if (from <= suggestions.hashtag.rangeRef.current.from + 1) {
                  suggestions.hashtag.activeRef.current = false;
                  suggestions.hashtag.rangeRef.current = null;
                  suggestions.hashtag.setShow(false);
                  suggestions.hashtag.setRange(null);
                }
              }
            }

            if (suggestions.dueDate.activeRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                suggestions.dueDate.activeRef.current = false;
                suggestions.dueDate.rangeRef.current = null;
                suggestions.dueDate.setShow(false);
                suggestions.dueDate.setRange(null);
                return true;
              }
              if (event.key === 'Backspace' && suggestions.dueDate.rangeRef.current) {
                const { from } = view.state.selection;
                if (from <= suggestions.dueDate.rangeRef.current.from + 2) {
                  suggestions.dueDate.activeRef.current = false;
                  suggestions.dueDate.rangeRef.current = null;
                  suggestions.dueDate.setShow(false);
                  suggestions.dueDate.setRange(null);
                }
              }
            }

            if (suggestions.emoji.activeRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                suggestions.emoji.activeRef.current = false;
                suggestions.emoji.rangeRef.current = null;
                suggestions.emoji.setShow(false);
                suggestions.emoji.setRange(null);
                return true;
              }
              if (event.key === 'Backspace' && suggestions.emoji.rangeRef.current) {
                const { from } = view.state.selection;
                if (from <= suggestions.emoji.rangeRef.current.from + 1) {
                  suggestions.emoji.activeRef.current = false;
                  suggestions.emoji.rangeRef.current = null;
                  suggestions.emoji.setShow(false);
                  suggestions.emoji.setRange(null);
                }
              }
            }

            return false;
          },
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain');
            if (!text) return false;

            if (!looksLikeMarkdownList(text)) return false;

            const items = parseMarkdownList(text);
            if (!items || items.length === 0) return false;

            event.preventDefault();

            if (items.length === 1) {
              const singleItem = items[0];
              view.dispatch(view.state.tr.insertText(singleItem.content.replace(/<[^>]*>/g, '')));

              if (singleItem.nodeType === 'checkbox') {
                const outlineStore = useOutlineStore.getState();
                if (node.node_type !== 'checkbox') {
                  outlineStore.toggleNodeType(nodeId);
                }
                if (singleItem.isChecked && !node.is_checked) {
                  outlineStore.toggleCheckbox(nodeId);
                }
              } else if (singleItem.nodeType === 'numbered') {
                const outlineStore = useOutlineStore.getState();
                if (node.node_type !== 'numbered') {
                  outlineStore.setNodeTypeTo(nodeId, 'numbered');
                }
              }
              return true;
            }

            const firstItem = items[0];
            const outlineStore = useOutlineStore.getState();

            outlineStore.updateContent(nodeId, firstItem.content);
            if (firstItem.nodeType === 'checkbox' && node.node_type !== 'checkbox') {
              outlineStore.toggleNodeType(nodeId);
              if (firstItem.isChecked) {
                outlineStore.toggleCheckbox(nodeId);
              }
            } else if (firstItem.nodeType === 'numbered' && node.node_type !== 'numbered') {
              outlineStore.setNodeTypeTo(nodeId, 'numbered');
            }

            const remainingItems = items.slice(1);
            if (remainingItems.length > 0) {
              const baseIndent = firstItem.indent;
              const adjustedItems = remainingItems.map(ri => ({
                ...ri,
                indent: ri.indent - baseIndent,
              }));
              outlineStore.createItemsFromMarkdown(nodeId, adjustedItems);
            }

            return true;
          },
        },
        onUpdate: ({ editor }) => {
          storeRef.current.updateContent(nodeId, editor.getHTML());
        },
        onFocus: () => {
          storeRef.current.setFocusedId(nodeId);
        },
      });

      editorRef.current = editor;
      setEditorReady(true);

      setTimeout(() => {
        if (editor.isDestroyed) return;
        const cursorPos = useOutlineStore.getState().pendingCursorPos;
        if (cursorPos !== null) {
          editor.commands.focus();
          editor.commands.setTextSelection(cursorPos + 1);
          useOutlineStore.getState().setPendingCursorPos(null);
        } else {
          editor.commands.focus('end');
        }
      }, 0);
    } else if (!isFocused && editorRef.current) {
      editorRef.current.destroy();
      editorRef.current = null;
      setEditorReady(false);
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, nodeId]);

  return { editorRef, editorReady };
}
```

- [ ] **Step 2: Use the hook in index.tsx**

Add the import:

```typescript
import { useOutlineEditor, type StoreActions } from './useOutlineEditor';
```

Remove from index.tsx:
- The `editorRef` useRef declaration
- The `editorReady` useState declaration
- The entire editor creation useEffect (the massive one from `useEffect(() => { if (isFocused && editorContainerRef.current ...` through its closing `}, [isFocused, node.id]);`)
- The imports that are now only used in the editor hook: `Editor` from `@tiptap/core`, `DOMSerializer` from `@tiptap/pm/model`, `StarterKit`, all TipTap extension imports (WikiLink, Hashtag, DueDate, AutoLink, MarkdownLink, Mention, EmojiShortcode, CustomEmojiNode), `looksLikeMarkdownList`, `parseMarkdownList`

Add the hook call:

```typescript
  const { editorRef, editorReady } = useOutlineEditor({
    nodeId: node.id,
    node,
    content: node.content || '',
    isFocused,
    editorContainerRef,
    storeRef,
    suggestions: suggestions.controls,
    onNavigateToNode,
    setIsEditingNote,
    noteInputRef,
    editorContainerRefForPicker: editorContainerRef,
    zoomToParent,
  });
```

Note: `editorContainerRefForPicker` is the same as `editorContainerRef` — the editor hook uses it to position the date/recurrence pickers relative to the editor.

- [ ] **Step 3: Run type check**

```bash
cd /home/andy/projects/outline/app && npm run check
```

Expected: No errors. If there are type mismatches on the `storeRef` type, ensure the `StoreActions` type exported from `useOutlineEditor.ts` matches the shape of `storeRef.current` in index.tsx.

- [ ] **Step 4: Run full Playwright test suite**

```bash
cd /home/andy/projects/outline/app && npx playwright test --reporter=line 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/andy/projects/outline
git add app/src/components/outline-item/useOutlineEditor.ts app/src/components/outline-item/index.tsx
git commit -m "$(cat <<'EOF'
Extract useOutlineEditor hook from OutlineItem

Moves the 717-line TipTap editor creation useEffect into its own hook.
Includes all extensions, handleTextInput (suggestion triggers),
handleKeyDown (30+ keyboard shortcuts), and handlePaste.
No logic changes.
EOF
)"
```

---

### Task 8: Final cleanup and verification

**Files:**
- Modify: `app/src/components/outline-item/index.tsx` (cleanup only)

- [ ] **Step 1: Verify file sizes**

```bash
cd /home/andy/projects/outline/app/src/components/outline-item
wc -l *.ts *.tsx | sort -rn
```

Expected approximate sizes:
- `useOutlineEditor.ts` ~650-750 lines
- `itemContextMenu.ts` ~200-220 lines
- `useSuggestions.ts` ~280-310 lines
- `bulkContextMenu.ts` ~140-160 lines
- `useNoteEditor.ts` ~90-100 lines
- `useDragDrop.ts` ~75-85 lines
- `index.tsx` ~750-900 lines

- [ ] **Step 2: Remove unused imports from index.tsx**

Check for any imports that are no longer used in index.tsx after all extractions. The following should have been removed during earlier tasks, but verify:

- `Editor` from `@tiptap/core` (moved to useOutlineEditor)
- `DOMSerializer` from `@tiptap/pm/model` (moved to useOutlineEditor)
- `StarterKit` (moved to useOutlineEditor)
- All TipTap extension imports (WikiLink, Hashtag, etc.)
- `looksLikeMarkdownList`, `parseMarkdownList` (moved to useOutlineEditor)
- `NODE_COLORS` from colorPalette (moved to context menu files)
- `DOMPurify` may still be needed for the static content effect — verify

Keep these in index.tsx:
- `ContextMenu`, `closeAllContextMenus` (used in JSX)
- `processStaticContentElement`, `handleStaticContentClick` (used in static content effect and click handler)
- `DOMPurify` (used in static content effect)
- `WikiLinkSuggestion`, `HashtagSuggestion`, `DueDateSuggestion`, `EmojiSuggestion` (used in JSX)
- `DatePicker`, `RecurrencePicker` and their mode types (used in JSX)
- `formatDateRelative`, `formatDateRange` (used in JSX)
- `getColorCss` (used in class building)

- [ ] **Step 3: Run type check**

```bash
cd /home/andy/projects/outline/app && npm run check
```

Expected: No errors.

- [ ] **Step 4: Run full Playwright test suite**

```bash
cd /home/andy/projects/outline/app && npx playwright test --reporter=line 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit if any cleanup was needed**

```bash
cd /home/andy/projects/outline
git add app/src/components/outline-item/index.tsx
git commit -m "$(cat <<'EOF'
Clean up unused imports after OutlineItem decomposition
EOF
)"
```
