import React, { useState, useRef, useCallback } from 'react';
import { Editor } from '@tiptap/core';
import { useOutlineStore } from '../../store/outlineStore';
import type { DatePickerMode } from '../ui/DatePicker';
import type { RecurrenceMode } from '../ui/RecurrencePicker';

export interface SuggestionControls {
  wikiLink: {
    activeRef: React.RefObject<boolean>;
    rangeRef: React.RefObject<{ from: number; to: number } | null>;
    setShow: (v: boolean) => void;
    setQuery: (v: string) => void;
    setRange: (v: { from: number; to: number } | null) => void;
    setPosition: (v: { x: number; y: number }) => void;
  };
  hashtag: {
    activeRef: React.RefObject<boolean>;
    rangeRef: React.RefObject<{ from: number; to: number } | null>;
    setShow: (v: boolean) => void;
    setQuery: (v: string) => void;
    setRange: (v: { from: number; to: number } | null) => void;
    setPosition: (v: { x: number; y: number }) => void;
  };
  dueDate: {
    activeRef: React.RefObject<boolean>;
    rangeRef: React.RefObject<{ from: number; to: number } | null>;
    setShow: (v: boolean) => void;
    setQuery: (v: string) => void;
    setRange: (v: { from: number; to: number } | null) => void;
    setPosition: (v: { x: number; y: number }) => void;
  };
  emoji: {
    activeRef: React.RefObject<boolean>;
    rangeRef: React.RefObject<{ from: number; to: number } | null>;
    setShow: (v: boolean) => void;
    setQuery: (v: string) => void;
    setRange: (v: { from: number; to: number } | null) => void;
    setPosition: (v: { x: number; y: number }) => void;
  };
  datePicker: {
    setShow: (v: boolean) => void;
    setPosition: (v: { x: number; y: number }) => void;
    setMode: (v: DatePickerMode) => void;
  };
  recurrencePicker: {
    setShow: (v: boolean) => void;
    setPosition: (v: { x: number; y: number }) => void;
  };
}

interface UseSuggestionsParams {
  editorRef: React.RefObject<Editor | null>;
  nodeId: string;
}

export function useSuggestions({ editorRef, nodeId }: UseSuggestionsParams) {
  // Wiki link suggestion state
  const [showWikiLinkSuggestion, setShowWikiLinkSuggestion] = useState(false);
  const [wikiLinkQuery, setWikiLinkQuery] = useState('');
  const [wikiLinkRange, setWikiLinkRange] = useState<{ from: number; to: number } | null>(null);
  const [wikiLinkPosition, setWikiLinkPosition] = useState({ x: 0, y: 0 });
  const wikiLinkActiveRef = useRef(false);
  const wikiLinkRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Hashtag suggestion state
  const [showHashtagSuggestion, setShowHashtagSuggestion] = useState(false);
  const [hashtagQuery, setHashtagQuery] = useState('');
  const [hashtagRange, setHashtagRange] = useState<{ from: number; to: number } | null>(null);
  const [hashtagPosition, setHashtagPosition] = useState({ x: 0, y: 0 });
  const hashtagActiveRef = useRef(false);
  const hashtagRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Due date suggestion state
  const [showDueDateSuggestion, setShowDueDateSuggestion] = useState(false);
  const [dueDateQuery, setDueDateQuery] = useState('');
  const [dueDateRange, setDueDateRange] = useState<{ from: number; to: number } | null>(null);
  const [dueDatePosition, setDueDatePosition] = useState({ x: 0, y: 0 });
  const dueDateActiveRef = useRef(false);
  const dueDateRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Emoji suggestion state
  const [showEmojiSuggestion, setShowEmojiSuggestion] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [emojiRange, setEmojiRange] = useState<{ from: number; to: number } | null>(null);
  const [emojiPosition, setEmojiPosition] = useState({ x: 0, y: 0 });
  const emojiActiveRef = useRef(false);
  const emojiRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState({ x: 0, y: 0 });
  const [datePickerMode, setDatePickerMode] = useState<DatePickerMode>('due');

  // Recurrence picker state
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const [recurrencePickerPosition, setRecurrencePickerPosition] = useState({ x: 0, y: 0 });

  // Suppress unused variable warnings for range state (used via setters in controls)
  void wikiLinkRange;
  void hashtagRange;
  void dueDateRange;
  void emojiRange;

  // Wiki link suggestion handlers
  const handleWikiLinkSelect = useCallback((nodeId: string, displayText: string) => {
    const editor = editorRef.current;
    const range = wikiLinkRangeRef.current;
    if (!editor || !range) return;

    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertWikiLink(nodeId, displayText)
      .run();

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

  // Hashtag suggestion handlers
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
  }, [editorRef]);

  const handleHashtagClose = useCallback(() => {
    hashtagActiveRef.current = false;
    hashtagRangeRef.current = null;
    setShowHashtagSuggestion(false);
    setHashtagRange(null);
  }, []);

  // Due date suggestion handlers
  const handleDueDateSelect = useCallback((date: string) => {
    const editor = editorRef.current;
    const range = dueDateRangeRef.current;
    if (!editor || !range) return;

    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent(`!(${date})`)
      .run();

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

  // Emoji suggestion handlers
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
  }, [editorRef]);

  const handleEmojiClose = useCallback(() => {
    emojiActiveRef.current = false;
    emojiRangeRef.current = null;
    setShowEmojiSuggestion(false);
    setEmojiRange(null);
  }, []);

  // Date picker handlers
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
    const state = await api.loadDocument(useOutlineStore.getState().documentId ?? undefined);
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

  // Recurrence picker handlers
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
    const state = await api.loadDocument(useOutlineStore.getState().documentId ?? undefined);
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
    wikiLink: {
      show: showWikiLinkSuggestion,
      query: wikiLinkQuery,
      position: wikiLinkPosition,
      onSelect: handleWikiLinkSelect,
      onClose: handleWikiLinkClose,
    },
    hashtag: {
      show: showHashtagSuggestion,
      query: hashtagQuery,
      position: hashtagPosition,
      onSelect: handleHashtagSelect,
      onClose: handleHashtagClose,
    },
    dueDate: {
      show: showDueDateSuggestion,
      query: dueDateQuery,
      position: dueDatePosition,
      onSelect: handleDueDateSelect,
      onClose: handleDueDateClose,
    },
    emoji: {
      show: showEmojiSuggestion,
      query: emojiQuery,
      position: emojiPosition,
      onSelect: handleEmojiSelect,
      onClose: handleEmojiClose,
    },
    datePicker: {
      show: showDatePicker,
      position: datePickerPosition,
      mode: datePickerMode,
      onSelect: handleDateSelect,
      onClose: handleDatePickerClose,
      onDateBadgeClick: handleDateBadgeClick,
      onDeferBadgeClick: handleDeferBadgeClick,
    },
    recurrencePicker: {
      show: showRecurrencePicker,
      position: recurrencePickerPosition,
      onSelect: handleRecurrenceSelect,
      onClose: handleRecurrencePickerClose,
      onIndicatorClick: handleRecurrenceIndicatorClick,
    },
    controls,
  };
}
