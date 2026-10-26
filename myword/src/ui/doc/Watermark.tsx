'use client';
// Design > Watermark: text across the middle of every page, behind the document text.
import type { Page } from '../../layout/types';
import type { DocSettings } from '../../model/types';
import { fontStack } from '../../layout/fonts';

export function Watermark({ page, wm }: { page: Page; wm: NonNullable<DocSettings['watermark']> }) {
  const diag = wm.diagonal !== false;
  const len = Math.max(1, wm.text.length);
  const avail = diag ? Math.hypot(page.w - page.mL - page.mR, page.h - page.mT - page.mB) * 0.82 : page.w - page.mL - page.mR;
  const size = Math.min(160, avail / (len * 0.62));
  const angle = diag ? -Math.atan2(page.h - page.mT - page.mB, page.w - page.mL - page.mR) * (180 / Math.PI) : 0;
  return (
    <svg width={page.w} height={page.h} className="absolute left-0 top-0 pointer-events-none" aria-hidden>
      <text
        x={page.w / 2}
        y={page.h / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(${angle} ${page.w / 2} ${page.h / 2})`}
        fill={wm.color ?? '#C0C0C0'}
        opacity={wm.semitransparent !== false ? 0.5 : 1}
        style={{ font: `${size}px ${fontStack(wm.font ?? 'Calibri')}` }}
      >
        {wm.text}
      </text>
    </svg>
  );
}
