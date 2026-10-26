// Units. The model stores lengths in points (pt); layout works in CSS pixels at 96 dpi.
// docx uses twips (1/20 pt), half-points (font sizes) and EMUs (drawings).

export const PX_PER_PT = 96 / 72;
export const PT_PER_IN = 72;
export const PT_PER_CM = 72 / 2.54;

export const ptToPx = (pt: number): number => pt * PX_PER_PT;
export const pxToPt = (px: number): number => px / PX_PER_PT;
export const twipsToPt = (tw: number): number => tw / 20;
export const ptToTwips = (pt: number): number => Math.round(pt * 20);
export const emuToPt = (emu: number): number => emu / 12700;
export const ptToEmu = (pt: number): number => Math.round(pt * 12700);

export type MeasureUnit = 'in' | 'cm' | 'mm' | 'pt' | 'pi';

/** Format a length for dialogs the way Word does ("1\"", "2.54 cm", "12 pt"). */
export function formatLength(pt: number, unit: MeasureUnit = 'in'): string {
  const r = (v: number, d = 2) => String(Math.round(v * 10 ** d) / 10 ** d);
  switch (unit) {
    case 'in':
      return r(pt / PT_PER_IN) + '"';
    case 'cm':
      return r(pt / PT_PER_CM) + ' cm';
    case 'mm':
      return r((pt / PT_PER_CM) * 10, 1) + ' mm';
    case 'pi':
      return r(pt / 12) + ' pi';
    default:
      return r(pt, 1) + ' pt';
  }
}

/** Parse "1.5", "1.5\"", "2 cm", "12pt", "3 pi" into points; bare numbers use `unit`. */
export function parseLength(s: string, unit: MeasureUnit = 'in'): number | null {
  const m = s.trim().match(/^(-?\d*\.?\d+)\s*("|in|cm|mm|pt|pi|li)?$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = (m[2] ?? unit).toLowerCase();
  switch (u) {
    case '"':
    case 'in':
      return v * PT_PER_IN;
    case 'cm':
      return v * PT_PER_CM;
    case 'mm':
      return (v * PT_PER_CM) / 10;
    case 'pi':
      return v * 12;
    case 'li':
      return v * 12;
    default:
      return v;
  }
}
