import type { MenuItem } from '../ui/ContextMenu';
import type { Node } from '../../lib/types';
import { NODE_COLORS } from '../../lib/colorPalette';

interface BuildBulkContextMenuParams {
  selectedNodes: Node[];
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

export function buildBulkContextMenu(params: BuildBulkContextMenuParams): MenuItem[] {
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
    deleteSelectedNodes, setSelectedNodesColor,
    onOpenBulkQuickMove,
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
