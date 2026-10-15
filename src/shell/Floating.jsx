// A pop-up drawn on top of the whole page (a portal on <body>, fixed to its
// anchor) so no card, table or scroll box around the anchor can cut it off
// (Luke, Oct 15: "confirm all dropdowns … are not hidden by other category
// boxes"). Opens below the anchor, or above it when the window has no room
// below; follows the anchor on scroll / resize; accounts for the site's CSS
// zoom (index.css --ui-zoom). SearchSelect (src/deals) does the same for its
// list.
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Floating({ anchor, open, children, className = '', align = 'left', gap = 4, onMouseEnter, onMouseLeave }) {
  const pop = useRef(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const a = anchor.current, p = pop.current;
      if (!a || !p) return;
      const r = a.getBoundingClientRect();
      const z = a.offsetWidth ? r.width / a.offsetWidth : 1;
      const vw = window.innerWidth / z, vh = window.innerHeight / z;
      const top = r.top / z, bottom = r.bottom / z, left = r.left / z, right = r.right / z;
      const h = p.offsetHeight, w = p.offsetWidth;
      const up = vh - bottom < h + gap + 8 && top > vh - bottom;
      const x = align === 'right' ? right - w : left;
      Object.assign(p.style, {
        left: `${Math.max(8, Math.min(x, vw - w - 8))}px`,
        top: up ? `${Math.max(8, top - gap - h)}px` : `${bottom + gap}px`,
        visibility: 'visible',
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open, anchor, align, gap]);
  if (!open) return null;
  return createPortal(
    <div ref={pop} className={`fixed z-[1000] ${className}`} style={{ visibility: 'hidden', left: 0, top: 0 }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {children}
    </div>,
    document.body,
  );
}
