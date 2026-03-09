/**
 * Client-side search query parser for structured filter operators.
 *
 * Supports the same operators as the Rust backend:
 * - `is:completed`, `is:heading`, `is:checkbox` -- filter by node type/state
 * - `has:date`, `has:note`, `has:children`, `has:color` -- filter by field presence
 * - `color:red` (etc.) -- filter by specific color
 * - `-term` (exclude)
 * - `"quoted phrase"` (exact phrase)
 * - `OR` (boolean or between terms)
 */

import type { Node } from './types';

export interface ParsedFilter {
  /** Plain text terms for content matching */
  textTerms: TextTerm[];
  /** Structured filters */
  filters: SearchFilter[];
}

export type TextTerm =
  | { type: 'required'; value: string }
  | { type: 'excluded'; value: string }
  | { type: 'phrase'; value: string }
  | { type: 'or' };

export type SearchFilter =
  | { kind: 'is_completed' }
  | { kind: 'is_not_completed' }
  | { kind: 'is_heading' }
  | { kind: 'is_checkbox' }
  | { kind: 'has_date' }
  | { kind: 'has_note' }
  | { kind: 'has_children' }
  | { kind: 'has_color' }
  | { kind: 'color_is'; value: string };

/** Cache parsed queries to avoid re-parsing on every node check. */
const parseCache = new Map<string, ParsedFilter>();
const MAX_CACHE_SIZE = 50;

/** Parse a search query string into structured components. */
export function parseFilterQuery(query: string): ParsedFilter {
  const cached = parseCache.get(query);
  if (cached) return cached;

  const result: ParsedFilter = { textTerms: [], filters: [] };
  let i = 0;
  let currentToken = '';

  while (i < query.length) {
    const ch = query[i];

    if (ch === '"') {
      // Quoted phrase
      i++; // skip opening quote
      let phrase = '';
      while (i < query.length && query[i] !== '"') {
        phrase += query[i];
        i++;
      }
      if (i < query.length) i++; // skip closing quote
      if (phrase) {
        result.textTerms.push({ type: 'phrase', value: phrase });
      }
    } else if (ch === ' ' || ch === '\t') {
      i++;
      if (currentToken) {
        processToken(currentToken, result);
        currentToken = '';
      }
    } else {
      currentToken += ch;
      i++;
    }
  }

  if (currentToken) {
    processToken(currentToken, result);
  }

  // Cache the result
  if (parseCache.size >= MAX_CACHE_SIZE) {
    const firstKey = parseCache.keys().next().value;
    if (firstKey !== undefined) parseCache.delete(firstKey);
  }
  parseCache.set(query, result);

  return result;
}

function processToken(token: string, result: ParsedFilter): void {
  if (token === 'OR') {
    result.textTerms.push({ type: 'or' });
    return;
  }

  // Exclusion prefix
  if (token.startsWith('-') && token.length > 1) {
    const rest = token.slice(1);
    // Check for negated operators
    const negated = tryParseNegatedOperator(rest);
    if (negated) {
      result.filters.push(negated);
      return;
    }
    result.textTerms.push({ type: 'excluded', value: rest });
    return;
  }

  // Operator:value syntax
  const colonIdx = token.indexOf(':');
  if (colonIdx > 0) {
    const op = token.slice(0, colonIdx).toLowerCase();
    const value = token.slice(colonIdx + 1).toLowerCase();

    switch (op) {
      case 'is':
        switch (value) {
          case 'completed': case 'checked': case 'done':
            result.filters.push({ kind: 'is_completed' });
            return;
          case 'not-completed': case 'unchecked': case 'not-done':
            result.filters.push({ kind: 'is_not_completed' });
            return;
          case 'heading':
            result.filters.push({ kind: 'is_heading' });
            return;
          case 'checkbox': case 'task':
            result.filters.push({ kind: 'is_checkbox' });
            return;
        }
        break;
      case 'has':
        switch (value) {
          case 'date':
            result.filters.push({ kind: 'has_date' });
            return;
          case 'note': case 'notes':
            result.filters.push({ kind: 'has_note' });
            return;
          case 'children': case 'child':
            result.filters.push({ kind: 'has_children' });
            return;
          case 'color': case 'colour':
            result.filters.push({ kind: 'has_color' });
            return;
        }
        break;
      case 'color': case 'colour':
        if (value) {
          result.filters.push({ kind: 'color_is', value });
          return;
        }
        break;
      case 'in': case 'edited': case 'created':
        // These operators work on the backend only (need SQL).
        // Pass them through as text so they reach the backend search.
        break;
    }
  }

  // Plain text term
  result.textTerms.push({ type: 'required', value: token });
}

function tryParseNegatedOperator(token: string): SearchFilter | null {
  const colonIdx = token.indexOf(':');
  if (colonIdx <= 0) return null;

  const op = token.slice(0, colonIdx).toLowerCase();
  const value = token.slice(colonIdx + 1).toLowerCase();

  if (op === 'is') {
    switch (value) {
      case 'completed': case 'checked': case 'done':
        return { kind: 'is_not_completed' };
    }
  }
  return null;
}

/**
 * Check whether a node matches a parsed filter query.
 *
 * `childCount` should be the number of direct children of the node,
 * provided by the caller from its children map.
 */
export function nodeMatchesParsedFilter(
  node: Node,
  parsed: ParsedFilter,
  childCount: number
): boolean {
  // Check structural filters first (fast rejection)
  for (const filter of parsed.filters) {
    switch (filter.kind) {
      case 'is_completed':
        if (!node.is_checked) return false;
        break;
      case 'is_not_completed':
        if (node.is_checked) return false;
        break;
      case 'is_heading':
        if (node.node_type !== 'heading') return false;
        break;
      case 'is_checkbox':
        if (node.node_type !== 'checkbox') return false;
        break;
      case 'has_date':
        if (!node.date) return false;
        break;
      case 'has_note':
        if (!node.note) return false;
        break;
      case 'has_children':
        if (childCount === 0) return false;
        break;
      case 'has_color':
        if (!node.color) return false;
        break;
      case 'color_is':
        if (!node.color || node.color.toLowerCase() !== filter.value) return false;
        break;
    }
  }

  // Check text terms
  if (parsed.textTerms.length === 0) return true;

  const contentLower = node.content.toLowerCase();
  const noteLower = node.note?.toLowerCase() ?? '';

  // Process text terms with OR support
  // Build groups separated by OR. Each group's terms must ALL match.
  // At least one group must match.
  const groups: TextTerm[][] = [[]];
  for (const term of parsed.textTerms) {
    if (term.type === 'or') {
      groups.push([]);
    } else {
      groups[groups.length - 1].push(term);
    }
  }

  // Filter out empty groups
  const validGroups = groups.filter(g => g.length > 0);
  if (validGroups.length === 0) return true;

  return validGroups.some(group =>
    group.every(term => {
      switch (term.type) {
        case 'required': {
          const termLower = term.value.toLowerCase();
          return contentLower.includes(termLower) || noteLower.includes(termLower);
        }
        case 'excluded': {
          const termLower = term.value.toLowerCase();
          return !contentLower.includes(termLower) && !noteLower.includes(termLower);
        }
        case 'phrase': {
          const phraseLower = term.value.toLowerCase();
          return contentLower.includes(phraseLower) || noteLower.includes(phraseLower);
        }
        default:
          return true;
      }
    })
  );
}

/**
 * Check if a query string contains any search operators.
 * Used to determine whether to show operator hints in the UI.
 */
export function hasSearchOperators(query: string): boolean {
  return /(?:^|\s)(?:is|has|color|colour|in|edited|created):/.test(query)
    || /(?:^|\s)-\S/.test(query)
    || query.includes('"')
    || /(?:^|\s)OR(?:\s|$)/.test(query);
}
