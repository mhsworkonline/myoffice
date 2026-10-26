'use client';
import { useMemo } from 'react';
import { selectionFormat, SelectionFormat } from '../../state/format';
import { useStore } from '../../state/store';

/** Formatting at the selection, recomputed when the document or selection changes. */
export function useFormat(): SelectionFormat {
  const rev = useStore((s) => s.rev);
  return useMemo(() => selectionFormat(), [rev]);
}
