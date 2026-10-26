'use client';
import { X } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { closeDialog } from '../../state/store';

interface Props {
  title: string;
  children: ReactNode;
  width?: number;
  onOk?: () => void | boolean | Promise<void | boolean>;
  okLabel?: string;
  cancelLabel?: string | null;
  onCancel?: () => void;
  footer?: ReactNode;
  extraButtons?: ReactNode;
  testId?: string;
  modal?: boolean;
  okDisabled?: boolean;
}

export function Dialog({ title, children, width = 420, onOk, okLabel = 'OK', cancelLabel = 'Cancel', onCancel, footer, extraButtons, testId, modal = true, okDisabled }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const cancel = () => {
    onCancel?.();
    closeDialog();
  };
  const ok = async () => {
    if (!onOk) return closeDialog();
    const r = await onOk();
    if (r !== false) closeDialog();
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(10, (window.innerWidth - r.width) / 2), y: Math.max(10, (window.innerHeight - r.height) / 2.6) });
    const first = el.querySelector('input:not([type=checkbox]):not([type=radio]):not([disabled]), select, textarea') as HTMLElement | null;
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') cancel();
    else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (!okDisabled) ok();
    }
  };
  const startDrag = (e: React.PointerEvent) => {
    if (!pos) return;
    const sx = e.clientX - pos.x;
    const sy = e.clientY - pos.y;
    const move = (ev: PointerEvent) => setPos({ x: ev.clientX - sx, y: Math.max(0, ev.clientY - sy) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={'fixed inset-0 z-[70] ' + (modal ? '' : 'pointer-events-none')} style={{ background: modal ? 'rgba(0,0,0,0.04)' : undefined }} onPointerDown={(e) => e.stopPropagation()}>
      <div
        ref={ref}
        role="dialog"
        aria-label={title}
        data-testid={testId ?? 'dialog'}
        className="mw-dialog absolute pointer-events-auto flex flex-col"
        style={{ width, left: pos?.x ?? -9999, top: pos?.y ?? 0, maxHeight: '92vh' }}
        onKeyDown={onKey}
      >
        <div className="mw-dialog-title" onPointerDown={startDrag}>
          <span className="flex-1 truncate">{title}</span>
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#C42B1C] hover:text-white" onClick={cancel} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="px-4 pb-2 pt-1 overflow-auto flex-1">{children}</div>
        {footer ?? (
          <div className="flex items-center justify-end gap-2 px-4 py-3">
            {extraButtons}
            <div className="flex-1" />
            {onOk !== undefined || okLabel ? (
              <button className="mw-btn mw-btn-primary" onClick={ok} disabled={okDisabled} data-testid="dialog-ok">
                {okLabel}
              </button>
            ) : null}
            {cancelLabel && (
              <button className="mw-btn" onClick={cancel} data-testid="dialog-cancel">
                {cancelLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={'flex items-center gap-2 my-1 ' + className}>
      <span className="min-w-[90px]">{label}</span>
      {children}
    </label>
  );
}

