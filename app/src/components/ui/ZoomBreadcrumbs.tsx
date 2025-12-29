import React from 'react';
import { useOutlineStore } from '../../store/outlineStore';

export function ZoomBreadcrumbs() {
  const zoomedNodeId = useOutlineStore(state => state.zoomedNodeId);
  const getZoomBreadcrumbs = useOutlineStore(state => state.getZoomBreadcrumbs);
  const zoomTo = useOutlineStore(state => state.zoomTo);

  if (!zoomedNodeId) {
    return null;
  }

  const breadcrumbs = getZoomBreadcrumbs();

  return (
    <div className="zoom-breadcrumbs">
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={crumb.id ?? 'home'}>
          {index > 0 && <span className="breadcrumb-separator">›</span>}
          <button
            className={`breadcrumb-item ${index === breadcrumbs.length - 1 ? 'current' : ''}`}
            onClick={() => zoomTo(crumb.id)}
            title={crumb.id ? `Zoom to "${crumb.title}"` : 'Return to document root'}
          >
            {crumb.title}
          </button>
        </React.Fragment>
      ))}
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
    </div>
  );
}

export default ZoomBreadcrumbs;
