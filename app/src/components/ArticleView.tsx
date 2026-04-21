import React, { useMemo } from 'react';
import type { TreeNode } from '../lib/types';
import DOMPurify from 'dompurify';
import { stripHtml } from '../lib/utils';
import { renderNoteHtml, handleNoteLinkClick } from '../lib/noteLinks';

interface ArticleViewProps {
  tree: TreeNode[];
}

/**
 * Renders an outline tree as flowing prose, stripping bullets and
 * nesting in favor of a readable document layout.
 *
 * Rendering rules:
 * - Heading nodes render as HTML headings (h1-h6)
 * - Top-level bullet items render as paragraphs
 * - Nested items render as nested paragraphs with indentation
 * - Checkbox items render with a checkbox marker
 * - Notes render as blockquotes below their parent
 * - Collapsed nodes still show their content (article view is for reading)
 *
 * All HTML content is sanitized via DOMPurify before rendering.
 */
export const ArticleView = React.memo(function ArticleView({ tree }: ArticleViewProps) {
  const content = useMemo(() => renderTree(tree, 0), [tree]);

  return (
    <div className="article-view" onClick={(e) => { handleNoteLinkClick(e); }}>
      {content}
    </div>
  );
});

function sanitize(html: string): string {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 's', 'a', 'span', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-wiki-link', 'data-node-id'],
  });
}

function renderTree(items: TreeNode[], depth: number): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  for (const item of items) {
    const { node, children, hasChildren } = item;
    const textContent = stripHtml(node.content);

    // Skip empty nodes with no children
    if (!textContent && !hasChildren && !node.note) {
      continue;
    }

    // All content is sanitized via DOMPurify before rendering
    const sanitizedContent = sanitize(node.content);

    // Heading nodes become HTML headings
    if (node.node_type === 'heading' && node.heading_level) {
      const level = Math.min(node.heading_level, 6);
      elements.push(
        React.createElement(`h${level}`, {
          key: node.id,
          className: 'article-heading',
          dangerouslySetInnerHTML: { __html: sanitizedContent },
        })
      );
    } else if (node.node_type === 'checkbox') {
      // Checkbox items get a task marker
      elements.push(
        <p
          key={node.id}
          className={`article-item article-checkbox ${node.is_checked ? 'article-checked' : ''}`}
          style={depth > 0 ? { marginLeft: `${depth * 1.5}em` } : undefined}
        >
          <span className="article-checkbox-marker">
            {node.is_checked ? '\u2611' : '\u2610'}
          </span>
          {' '}
          <span dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
        </p>
      );
    } else if (textContent) {
      // Regular items become paragraphs
      // Top-level items are normal paragraphs; deeper items get indentation
      elements.push(
        <p
          key={node.id}
          className="article-item"
          style={depth > 0 ? { marginLeft: `${depth * 1.5}em` } : undefined}
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />
      );
    }

    // Notes render as blockquotes (content sanitized via DOMPurify)
    if (node.note) {
      const noteText = stripHtml(node.note);
      if (noteText) {
        // renderNoteHtml sanitizes (DOMPurify) and linkifies bare URLs.
        const sanitizedNote = renderNoteHtml(node.note);
        elements.push(
          <blockquote
            key={`${node.id}-note`}
            className="article-note"
            style={depth > 0 ? { marginLeft: `${depth * 1.5}em` } : undefined}
            dangerouslySetInnerHTML={{ __html: sanitizedNote }}
          />
        );
      }
    }

    // Always render children in article view (ignore collapsed state)
    if (hasChildren && children.length > 0) {
      elements.push(...renderTree(children, depth + 1));
    }
  }

  return elements;
}

export default ArticleView;
