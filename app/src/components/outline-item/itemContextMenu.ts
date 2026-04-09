import type { MenuItem } from '../ui/ContextMenu';
import type { Node, NodeType } from '../../lib/types';
import type { DatePickerMode } from '../ui/DatePicker';
import { NODE_COLORS } from '../../lib/colorPalette';
import { useOutlineStore } from '../../store/outlineStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useBookmarkStore } from '../../store/bookmarkStore';

interface BuildItemContextMenuParams {
  node: Node;
  hasChildren: boolean;
  isBookmarked: boolean;
  documentId: string | null | undefined;
  plainTextContent: string;
  contextMenuPosition: { x: number; y: number };
  // Store actions
  toggleCheckbox: (id: string) => void;
  toggleNodeType: (id: string) => void;
  setNodeTypeTo: (id: string, type: NodeType) => void;
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
  // Date picker openers
  setDatePickerPosition: (pos: { x: number; y: number }) => void;
  setDatePickerMode: (mode: DatePickerMode) => void;
  setShowDatePicker: (show: boolean) => void;
}

export function buildItemContextMenu(params: BuildItemContextMenuParams): MenuItem[] {
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
