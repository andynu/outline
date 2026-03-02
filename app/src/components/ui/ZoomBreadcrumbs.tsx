import React from 'react';
import { useOutlineStore } from '../../store/outlineStore';

export function ZoomBreadcrumbs() {
  const zoomedNodeId = useOutlineStore(state => state.zoomedNodeId);
  const getZoomBreadcrumbs = useOutlineStore(state => state.getZoomBreadcrumbs);
  const zoomTo = useOutlineStore(state => state.zoomTo);
  const zoomGoBack = useOutlineStore(state => state.zoomGoBack);
  const zoomGoForward = useOutlineStore(state => state.zoomGoForward);
  const canGoBack = useOutlineStore(state => state._zoomHistoryBack.length > 0);
  const canGoForward = useOutlineStore(state => state._zoomHistoryForward.length > 0);

  const hasHistory = canGoBack || canGoForward;

  // Show nothing if not zoomed and no history
  if (!zoomedNodeId && !hasHistory) {
    return null;
  }

  const breadcrumbs = zoomedNodeId ? getZoomBreadcrumbs() : [];

  return (
    <div className="zoom-breadcrumbs">
      <button
        className="zoom-nav-btn"
        onClick={zoomGoBack}
        disabled={!canGoBack}
        title="Go back (Alt+Left)"
        aria-label="Go back in zoom history"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        className="zoom-nav-btn"
        onClick={zoomGoForward}
        disabled={!canGoForward}
        title="Go forward (Alt+Right)"
        aria-label="Go forward in zoom history"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={crumb.id ?? 'home'}>
          {index > 0 && <span className="breadcrumb-separator">&rsaquo;</span>}
          <button
            className={`breadcrumb-item ${index === breadcrumbs.length - 1 ? 'current' : ''}`}
            onClick={() => zoomTo(crumb.id)}
            title={crumb.id ? `Zoom to "${crumb.title}"` : 'Return to document root'}
          >
            {crumb.title}
          </button>
        </React.Fragment>
      ))}
      {zoomedNodeId && (
        <button
          className="zoom-close-btn"
          onClick={() => zoomTo(null)}
          title="Exit zoom (Escape)"
          aria-label="Exit zoom"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default ZoomBreadcrumbs;
