// Font substitution and the list of fonts offered in the font box. Microsoft fonts are used when
// installed; otherwise metric-compatible open fonts bundled with the app stand in for them, so
// line and page breaks match Word for documents in the common Office fonts.

const SUBSTITUTES: Record<string, string> = {
  calibri: 'Carlito',
  'calibri light': 'Carlito',
  cambria: 'Caladea',
  'cambria math': 'Caladea',
  arial: 'Arimo',
  helvetica: 'Arimo',
  'arial nova': 'Arimo',
  'times new roman': 'Tinos',
  times: 'Tinos',
  'courier new': 'Cousine',
  courier: 'Cousine',
  aptos: 'Carlito',
  'aptos display': 'Carlito',
  'segoe ui': 'Arimo',
  verdana: 'Arimo',
  tahoma: 'Arimo',
  georgia: 'Tinos',
  garamond: 'Tinos',
  'book antiqua': 'Tinos',
  'palatino linotype': 'Tinos',
  consolas: 'Cousine',
  'lucida console': 'Cousine',
};

const SERIF_HINT = /(times|serif|roman|garamond|georgia|cambria|book|palatino|minion|baskerville|bodoni|century)/i;
const MONO_HINT = /(mono|courier|consolas|code|console|typewriter)/i;

const stackCache = new Map<string, string>();

/** CSS font-family stack for a Word font name. */
export function fontStack(name: string): string {
  const hit = stackCache.get(name);
  if (hit) return hit;
  const key = name.trim().toLowerCase();
  const sub = SUBSTITUTES[key] ?? (MONO_HINT.test(name) ? 'Cousine' : SERIF_HINT.test(name) ? 'Tinos' : 'Carlito');
  const q = (f: string) => (/^[a-z-]+$/i.test(f) ? f : `"${f.replace(/"/g, '')}"`);
  const fam = name === 'Symbol' || name === 'Wingdings' ? `${q('Segoe UI Symbol')}, ${q(sub)}` : `${q(name)}, ${q(sub)}`;
  const stack = `${fam}, ${MONO_HINT.test(name) ? 'monospace' : SERIF_HINT.test(name) ? 'serif' : 'sans-serif'}`;
  stackCache.set(name, stack);
  return stack;
}

/** Fonts listed in the font box: the theme pair first, then everything that is available here. */
export const COMMON_FONTS = [
  'Agency FB',
  'Algerian',
  'Aptos',
  'Arial',
  'Arial Black',
  'Arial Narrow',
  'Arial Rounded MT Bold',
  'Bahnschrift',
  'Baskerville Old Face',
  'Bell MT',
  'Berlin Sans FB',
  'Bodoni MT',
  'Book Antiqua',
  'Bookman Old Style',
  'Bradley Hand ITC',
  'Britannic Bold',
  'Broadway',
  'Brush Script MT',
  'Calibri',
  'Calibri Light',
  'Californian FB',
  'Calisto MT',
  'Cambria',
  'Cambria Math',
  'Candara',
  'Castellar',
  'Centaur',
  'Century',
  'Century Gothic',
  'Century Schoolbook',
  'Chiller',
  'Colonna MT',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Cooper Black',
  'Copperplate Gothic Bold',
  'Corbel',
  'Courier New',
  'Curlz MT',
  'Ebrima',
  'Edwardian Script ITC',
  'Elephant',
  'Engravers MT',
  'Eras Medium ITC',
  'Felix Titling',
  'Footlight MT Light',
  'Forte',
  'Franklin Gothic Book',
  'Franklin Gothic Medium',
  'Freestyle Script',
  'French Script MT',
  'Gabriola',
  'Gadugi',
  'Garamond',
  'Georgia',
  'Gigi',
  'Gill Sans MT',
  'Gloucester MT Extra Condensed',
  'Goudy Old Style',
  'Haettenschweiler',
  'Harlow Solid Italic',
  'Harrington',
  'High Tower Text',
  'Impact',
  'Imprint MT Shadow',
  'Ink Free',
  'Javanese Text',
  'Jokerman',
  'Juice ITC',
  'Kristen ITC',
  'Kunstler Script',
  'Leelawadee UI',
  'Lucida Bright',
  'Lucida Calligraphy',
  'Lucida Console',
  'Lucida Fax',
  'Lucida Handwriting',
  'Lucida Sans',
  'Lucida Sans Unicode',
  'Magneto',
  'Maiandra GD',
  'Malgun Gothic',
  'Matura MT Script Capitals',
  'Microsoft Himalaya',
  'Microsoft JhengHei',
  'Microsoft Sans Serif',
  'Microsoft YaHei',
  'Mistral',
  'Modern No. 20',
  'Mongolian Baiti',
  'Monotype Corsiva',
  'MS Gothic',
  'MS Mincho',
  'MV Boli',
  'Myanmar Text',
  'Nirmala UI',
  'Old English Text MT',
  'Onyx',
  'Palace Script MT',
  'Palatino Linotype',
  'Papyrus',
  'Parchment',
  'Perpetua',
  'Playbill',
  'Poor Richard',
  'Pristina',
  'Rage Italic',
  'Ravie',
  'Rockwell',
  'Script MT Bold',
  'Segoe Print',
  'Segoe Script',
  'Segoe UI',
  'Segoe UI Emoji',
  'Segoe UI Symbol',
  'Showcard Gothic',
  'SimSun',
  'Snap ITC',
  'Stencil',
  'Sylfaen',
  'Symbol',
  'Tahoma',
  'Tempus Sans ITC',
  'Times New Roman',
  'Trebuchet MS',
  'Tw Cen MT',
  'Verdana',
  'Viner Hand ITC',
  'Vivaldi',
  'Vladimir Script',
  'Webdings',
  'Wide Latin',
  'Wingdings',
];

/** Fonts that always render (bundled or substituted with matching metrics). */
const ALWAYS = new Set(['Calibri', 'Calibri Light', 'Cambria', 'Arial', 'Times New Roman', 'Courier New', 'Aptos', 'Carlito', 'Caladea', 'Arimo', 'Tinos', 'Cousine']);

let available: string[] | null = null;

/** Detect installed fonts by comparing glyph widths against two generic fallbacks. */
export function availableFonts(): string[] {
  if (available) return available;
  if (typeof document === 'undefined') return COMMON_FONTS;
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return COMMON_FONTS;
  const sample = 'mmmmmmmmmmlliWW@#0123';
  const w = (f: string) => {
    c.font = `40px ${f}`;
    return c.measureText(sample).width;
  };
  const baseSans = w('sans-serif');
  const baseMono = w('monospace');
  available = COMMON_FONTS.filter((f) => {
    if (ALWAYS.has(f)) return true;
    const q = `"${f}"`;
    return w(`${q}, sans-serif`) !== baseSans || w(`${q}, monospace`) !== baseMono;
  });
  return available;
}

export function isSubstituted(name: string): boolean {
  if (typeof document === 'undefined') return false;
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return false;
  const sample = 'mmmmmmmmmmlliWW@#0123';
  c.font = `40px "${name}", monospace`;
  const a = c.measureText(sample).width;
  c.font = '40px monospace';
  return a === c.measureText(sample).width;
}
