import { useState, useCallback, useRef, useEffect } from 'react';

const DEFAULT_STORAGE_KEY = 'cpq-tracker-position';

interface Position { x: number; y: number }

interface UseDraggableOptions {
  storageKey?: string;
  defaultPosition?: 'bottom-right' | 'top-right' | 'top-center';
}

const DEFAULT_POS: Position = { x: -1, y: -1 }; // -1 means "use CSS default"

function clamp(pos: Position, elW: number, elH: number): Position {
  const maxX = window.innerWidth - elW;
  const maxY = window.innerHeight - elH;
  return {
    x: Math.max(0, Math.min(pos.x, maxX)),
    y: Math.max(0, Math.min(pos.y, maxY)),
  };
}

function loadPos(key: string): Position {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_POS;
}

function savePos(key: string, pos: Position) {
  try { localStorage.setItem(key, JSON.stringify(pos)); } catch { /* ignore */ }
}

export function useDraggable(options?: UseDraggableOptions) {
  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;
  const defaultPosition = options?.defaultPosition ?? 'bottom-right';

  const [pos, setPos] = useState<Position>(() => loadPos(storageKey));
  const dragging = useRef(false);
  const offset = useRef({ dx: 0, dy: 0 });
  const elRef = useRef<HTMLDivElement | null>(null);

  const isDefault = pos.x === -1 && pos.y === -1;

  // Initialise position from CSS default on first render
  useEffect(() => {
    if (isDefault && elRef.current) {
      const rect = elRef.current.getBoundingClientRect();
      const initial = { x: rect.left, y: rect.top };
      setPos(initial);
      savePos(storageKey, initial);
    }
  }, [isDefault, storageKey]);

  // Keep in-bounds on resize
  useEffect(() => {
    const onResize = () => {
      if (elRef.current && !isDefault) {
        const rect = elRef.current.getBoundingClientRect();
        setPos(prev => {
          const clamped = clamp(prev, rect.width, rect.height);
          savePos(storageKey, clamped);
          return clamped;
        });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isDefault, storageKey]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!elRef.current) return;
    dragging.current = true;
    const rect = elRef.current.getBoundingClientRect();
    offset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !elRef.current) return;
    const rect = elRef.current.getBoundingClientRect();
    const next = clamp(
      { x: e.clientX - offset.current.dx, y: e.clientY - offset.current.dy },
      rect.width,
      rect.height,
    );
    setPos(next);
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    setPos(prev => { savePos(storageKey, prev); return prev; });
  }, [storageKey]);

  const resetPosition = useCallback(() => {
    localStorage.removeItem(storageKey);
    setPos(DEFAULT_POS);
  }, [storageKey]);

  const defaultCss: React.CSSProperties = defaultPosition === 'top-right'
    ? { position: 'fixed', top: 80, right: 20 }
    : defaultPosition === 'top-center'
    ? { position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)' }
    : { position: 'fixed', bottom: 24, right: 24 };

  const style: React.CSSProperties = isDefault
    ? defaultCss
    : { position: 'fixed', left: pos.x, top: pos.y };

  const dragHandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    style: { cursor: 'grab', touchAction: 'none' as const },
  };

  return { elRef, style, dragHandleProps, resetPosition };
}
