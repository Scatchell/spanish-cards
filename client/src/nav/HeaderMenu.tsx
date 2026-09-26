import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

// Below the .header-menu breakpoint in styles.css the actions collapse behind the toggle.
export function HeaderMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`header-menu${open ? ' open' : ''}`} ref={containerRef}>
      <button
        type="button"
        className="header-menu-toggle secondary"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="header-menu-actions"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">{open ? '✕' : '☰'}</span>
      </button>
      <div
        id="header-menu-actions"
        className="header-actions"
        onClick={(e) => {
          const tappedAction = (e.target as HTMLElement).closest('a, button');
          if (tappedAction) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
