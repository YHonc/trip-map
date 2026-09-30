'use client';
import { MoreHorizontal, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export function IconButton({
  label,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
export function MoreMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (
        !ref.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const scroll = (event: Event) => {
      // Map tiles and focus restoration can scroll unrelated nodes. Only dismiss
      // when the trigger's own scrolling container moves underneath the menu.
      const target = event.target;
      if (target instanceof Element && target !== document.body && ref.current && target.contains(ref.current)) setOpen(false);
    };
    const rect = ref.current?.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? 150;
    if (rect)
      setPosition({
        left: Math.max(10, Math.min(window.innerWidth - 174, rect.right - 164)),
        top:
          rect.bottom + height + 10 > window.innerHeight
            ? Math.max(10, rect.top - height - 4)
            : rect.bottom + 4,
      });
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  return (
    <div className="more-menu" ref={ref}>
      <IconButton
        label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-expanded={open}
      >
        <MoreHorizontal size={18} />
      </IconButton>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="dropdown-menu glass"
            style={{
              position: 'fixed',
              left: position.left,
              top: position.top,
              right: 'auto',
              zIndex: 95,
            }}
            role="menu"
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusable = () => [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not([type="file"]):not([aria-hidden="true"]),select:not([aria-hidden="true"]),textarea,summary,[tabindex="0"]',
      ) ?? []),
    ];
    (
      ref.current?.querySelector<HTMLElement>('input:not([type="file"]):not([aria-hidden="true"]),select:not([aria-hidden="true"]),textarea') ??
      focusable()[0]
    )?.focus();
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('[data-radix-select-viewport], [role="listbox"]')) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const els = focusable();
        if (e.shiftKey && document.activeElement === els[0]) {
          e.preventDefault();
          els.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === els.at(-1)) {
          e.preventDefault();
          els[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal glass ${className}`}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton label="关闭弹窗" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
