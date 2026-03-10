import type { Node } from './types';
import { stripHtml } from './utils';

/**
 * Ancestry-aware search for QuickMove and QuickNavigator.
 *
 * Builds full ancestry paths for nodes and matches multi-term queries
 * against the path segments (e.g., typing "Tech Rails" finds nodes
 * under KB > Tech > Rails).
 */

export interface AncestrySearchResult {
  node_id: string;
  content: string;          // Plain text content of the node
  breadcrumb: string;       // Full path like "KB / Tech / Rails / ActiveRecord"
  breadcrumbSegments: string[]; // Individual segments for display
  score: number;            // Higher is better
}

interface CachedNodeInfo {
  id: string;
  plainContent: string;       // Stripped HTML content
  plainContentLower: string;  // Lowercased for matching
  breadcrumbSegments: string[];  // Ancestry path segments (root first)
  breadcrumbLower: string[];     // Lowercased segments for matching
  depth: number;
}

/**
 * Build a cached ancestry index from a flat node list.
 * Call this once when the search modal opens, not on every keystroke.
 */
export function buildAncestryIndex(nodes: Node[]): CachedNodeInfo[] {
  // Build a map for O(1) parent lookups
  const nodesById = new Map<string, Node>();
  for (const node of nodes) {
    nodesById.set(node.id, node);
  }

  const cache: CachedNodeInfo[] = [];

  for (const node of nodes) {
    const plainContent = stripHtml(node.content);
    if (!plainContent) continue; // Skip empty nodes

    // Walk up the ancestry chain to build breadcrumb
    const segments: string[] = [];
    let current: Node | undefined = node;
    let depth = 0;

    // Safety: limit to 100 levels to prevent infinite loops from broken data
    while (current && depth < 100) {
      const text = stripHtml(current.content);
      if (text) {
        segments.unshift(text);
      }
      if (current.parent_id == null) break;
      current = nodesById.get(current.parent_id);
      depth++;
    }

    cache.push({
      id: node.id,
      plainContent,
      plainContentLower: plainContent.toLowerCase(),
      breadcrumbSegments: segments,
      breadcrumbLower: segments.map(s => s.toLowerCase()),
      depth: segments.length - 1, // 0-based depth
    });
  }

  return cache;
}

/**
 * Search the ancestry index with a query string.
 *
 * When the query has no spaces, matches against individual node content.
 * When the query has spaces, splits into terms and matches each term
 * against any segment in the ancestry path.
 *
 * Results are ranked:
 * 1. Exact content match (highest)
 * 2. All terms match in path order (terms appear in same order as ancestry)
 * 3. All terms match in any order
 * 4. Content-only match (single term)
 * 5. Partial term matches (some but not all terms match)
 *
 * Within each tier, shallower (closer to root) nodes rank higher for
 * disambiguation, but leaf nodes matching all terms rank above parents.
 */
export function searchAncestryIndex(
  index: CachedNodeInfo[],
  query: string,
  limit: number = 30,
  excludeNodeIds?: Set<string>
): AncestrySearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const queryLower = trimmed.toLowerCase();
  const terms = trimmed.split(/\s+/).map(t => t.toLowerCase()).filter(t => t.length > 0);
  const isMultiTerm = terms.length > 1;

  const results: AncestrySearchResult[] = [];

  for (const entry of index) {
    if (excludeNodeIds && excludeNodeIds.has(entry.id)) continue;

    let score = 0;

    if (isMultiTerm) {
      // Multi-term: match each term against any breadcrumb segment
      const termMatches: number[] = []; // Index of matching segment for each term
      let allMatch = true;

      for (const term of terms) {
        let matchIdx = -1;
        for (let i = 0; i < entry.breadcrumbLower.length; i++) {
          if (entry.breadcrumbLower[i].includes(term)) {
            matchIdx = i;
            break;
          }
        }
        if (matchIdx === -1) {
          allMatch = false;
          break;
        }
        termMatches.push(matchIdx);
      }

      if (!allMatch) {
        // Check partial match: at least some terms match
        let matchCount = 0;
        for (const term of terms) {
          for (const seg of entry.breadcrumbLower) {
            if (seg.includes(term)) {
              matchCount++;
              break;
            }
          }
        }
        if (matchCount === 0) continue;

        // Partial match: score based on fraction of terms matched
        score = 10 * (matchCount / terms.length);
      } else {
        // All terms match. Check if they're in path order.
        let inOrder = true;
        for (let i = 1; i < termMatches.length; i++) {
          if (termMatches[i] < termMatches[i - 1]) {
            inOrder = false;
            break;
          }
        }

        if (inOrder) {
          // Check if last term matches the node itself (leaf match)
          const lastTermMatchesLeaf = entry.plainContentLower.includes(terms[terms.length - 1]);
          score = lastTermMatchesLeaf ? 100 : 80;

          // Bonus for exact/prefix matches on segments
          let exactBonus = 0;
          for (let i = 0; i < terms.length; i++) {
            const segIdx = termMatches[i];
            if (entry.breadcrumbLower[segIdx] === terms[i]) {
              exactBonus += 5; // Exact match on segment
            } else if (entry.breadcrumbLower[segIdx].startsWith(terms[i])) {
              exactBonus += 2; // Prefix match
            }
          }
          score += exactBonus;

          // Bonus for consecutive segment matches (contiguous path)
          let consecutive = true;
          for (let i = 1; i < termMatches.length; i++) {
            if (termMatches[i] !== termMatches[i - 1] + 1) {
              consecutive = false;
              break;
            }
          }
          if (consecutive) score += 10;

        } else {
          // All terms match but out of order
          score = 50;
        }

        // Slight preference for deeper paths (more specific results)
        // but cap it to avoid deep nesting dominating
        score += Math.min(entry.depth, 5) * 0.5;
      }
    } else {
      // Single term: match against node content (like original behavior)
      if (entry.plainContentLower.includes(queryLower)) {
        score = 50;

        // Bonus for exact or prefix match
        if (entry.plainContentLower === queryLower) {
          score += 30;
        } else if (entry.plainContentLower.startsWith(queryLower)) {
          score += 15;
        }
      } else {
        // Also check ancestry for single-term matches
        let ancestorMatch = false;
        for (const seg of entry.breadcrumbLower) {
          if (seg.includes(queryLower)) {
            ancestorMatch = true;
            break;
          }
        }
        if (!ancestorMatch) continue;

        // Ancestor-only match ranks lower than direct content match
        score = 10;
      }
    }

    if (score > 0) {
      results.push({
        node_id: entry.id,
        content: entry.plainContent,
        breadcrumb: entry.breadcrumbSegments.join(' / '),
        breadcrumbSegments: entry.breadcrumbSegments,
        score,
      });
    }
  }

  // Sort by score descending, then by content length (shorter = more specific)
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.content.length - b.content.length;
  });

  return results.slice(0, limit);
}
