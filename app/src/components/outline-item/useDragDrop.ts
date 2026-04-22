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
      // Use custom MIME type so TipTap won't try to insert it as text
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

    // Don't allow dropping on self
    if (draggedId === nodeId) {
      return;
    }

    setIsDragOver(true);

    // Determine drop position based on mouse Y position
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
    isDragOver, dropPosition,
    handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop,
  };
}
