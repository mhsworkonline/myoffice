// Original Fluent-style SVG icons for the ribbon (drawn for MyWord, not Microsoft assets).
const BL = '#185ABD';
const B2 = '#2B7CD3';
const GR = '#616161';

type P = { size?: number };

export const AppIcon = () => (
  <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
    <rect x="9" y="3" width="20" height="26" rx="2.5" fill="#41A5EE" />
    <rect x="9" y="3" width="20" height="8.7" rx="2.5" fill="#2B7CD3" />
    <rect x="9" y="10" width="20" height="9" fill="#185ABD" />
    <path d="M9 19h20v7.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 9 26.5z" fill="#103F91" />
    <rect x="2" y="8" width="16" height="16" rx="2" fill="#185ABD" />
    <path d="M5 12.2h1.9l1.3 5.3 1.4-5.3h1.6l1.4 5.3 1.3-5.3h1.9l-2.3 8h-1.7L10.4 15l-1.4 5.2H7.3z" fill="#fff" />
  </svg>
);

export const PasteIcon = () => (
  <svg width="30" height="32" viewBox="0 0 30 32" aria-hidden>
    <rect x="3" y="4" width="18" height="24" rx="2" fill="#C8A165" />
    <rect x="8" y="2" width="8" height="5" rx="1.5" fill="#6B6B6B" />
    <rect x="11" y="11" width="16" height="19" rx="1.5" fill="#fff" stroke="#6B6B6B" />
    <path d="M14 16h10M14 19.5h10M14 23h7" stroke={B2} strokeWidth="1.2" />
  </svg>
);

/** Letter-glyph buttons like Word's B / I / U. */
export const Glyph = ({ ch, bold, italic, underline, strike, size = 16 }: { ch: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; size?: number }) => (
  <span
    aria-hidden
    style={{
      display: 'inline-flex',
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
      font: `${bold ? 700 : 400} ${italic ? 'italic ' : ''}${size - 1}px "Segoe UI", system-ui, sans-serif`,
      fontStyle: italic ? 'italic' : 'normal',
      textDecoration: [underline ? 'underline' : '', strike ? 'line-through' : ''].join(' ').trim() || 'none',
      lineHeight: 1,
    }}
  >
    {ch}
  </span>
);

export const GrowFontIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <text x="0" y="14" fontSize="13" fontFamily="Segoe UI, Arial" fill="currentColor">A</text>
    <path d="M11 6l2.5-3L16 6" stroke="currentColor" fill="none" strokeWidth="1.2" />
  </svg>
);

export const ShrinkFontIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <text x="0" y="14" fontSize="11" fontFamily="Segoe UI, Arial" fill="currentColor">A</text>
    <path d="M10 3l2.5 3L15 3" stroke="currentColor" fill="none" strokeWidth="1.2" />
  </svg>
);

export const ChangeCaseIcon = ({ size = 16 }: P) => (
  <svg width={size + 4} height={size} viewBox="0 0 20 16" aria-hidden>
    <text x="0" y="13" fontSize="13" fontFamily="Segoe UI, Arial" fill="currentColor">Aa</text>
  </svg>
);

export const ClearFormatIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <text x="0" y="12" fontSize="12" fontFamily="Segoe UI, Arial" fill="currentColor">A</text>
    <path d="M8.5 13.5l3.5-6 3 1.7-3.5 6z" fill="#F4B6C2" stroke="#C0504D" strokeWidth=".8" />
  </svg>
);

export const TextEffectsIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <text x="1.5" y="13.5" fontSize="14" fontWeight="700" fontFamily="Segoe UI, Arial" fill="#fff" stroke={B2} strokeWidth="1.1">A</text>
  </svg>
);

export const HighlightIcon = ({ size = 16, color = '#FFFF00' }: P & { color?: string }) => (
  <span className="relative inline-flex flex-col items-center leading-none" aria-hidden>
    <svg width={size} height={size - 3} viewBox="0 0 16 13">
      <path d="M3 10l6.5-8 3 2.4L6 12.3H3z" fill="#fff" stroke="#555" strokeWidth=".9" />
      <path d="M3 10l3 2.3" stroke="#555" strokeWidth=".9" />
      <path d="M9.5 2l3 2.4 1.2-1.4-3-2.4z" fill="#555" />
    </svg>
    <span className="block w-[16px] h-[4px]" style={{ background: color, outline: color === '#FFFFFF' || color === 'transparent' ? '1px solid #ccc' : undefined }} />
  </span>
);

export const FontColorIcon = ({ color = '#C00000' }: { color?: string }) => (
  <span className="relative inline-flex flex-col items-center leading-none" aria-hidden>
    <svg width="16" height="13" viewBox="0 0 16 13">
      <text x="2.5" y="11.5" fontSize="12.5" fontFamily="Segoe UI, Arial" fill="currentColor">A</text>
    </svg>
    <span className="block w-[16px] h-[4px]" style={{ background: color }} />
  </span>
);

export const BulletsIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <circle cx="2.5" cy="3.5" r="1.4" fill={BL} />
    <circle cx="2.5" cy="8" r="1.4" fill={BL} />
    <circle cx="2.5" cy="12.5" r="1.4" fill={BL} />
    <path d="M6 3.5h9M6 8h9M6 12.5h9" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

export const NumberingIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <text x="0" y="5.5" fontSize="5.5" fontFamily="Segoe UI, Arial" fill={BL}>1</text>
    <text x="0" y="10" fontSize="5.5" fontFamily="Segoe UI, Arial" fill={BL}>2</text>
    <text x="0" y="14.5" fontSize="5.5" fontFamily="Segoe UI, Arial" fill={BL}>3</text>
    <path d="M6 3.5h9M6 8h9M6 12.5h9" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

export const MultilevelIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <text x="0" y="5" fontSize="5" fontFamily="Segoe UI, Arial" fill={BL}>1</text>
    <text x="3" y="10" fontSize="5" fontFamily="Segoe UI, Arial" fill={BL}>a</text>
    <text x="6" y="15" fontSize="5" fontFamily="Segoe UI, Arial" fill={BL}>i</text>
    <path d="M4.5 3.5h10.5M7.5 8h7.5M10 12.5h5" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

export const SortIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <text x="0" y="6.5" fontSize="6.5" fontWeight="700" fontFamily="Segoe UI, Arial" fill={BL}>A</text>
    <text x="0" y="14.5" fontSize="6.5" fontWeight="700" fontFamily="Segoe UI, Arial" fill="currentColor">Z</text>
    <path d="M11 2v12M8.5 11.5L11 14l2.5-2.5" stroke="currentColor" fill="none" strokeWidth="1.2" />
  </svg>
);

export const LineSpacingIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <path d="M7 3h9M7 6.3h9M7 9.6h9M7 13h9" stroke="currentColor" strokeWidth="1.1" />
    <path d="M3 1.5v13M1 4l2-2.5L5 4M1 12l2 2.5L5 12" stroke={BL} fill="none" strokeWidth="1.1" />
  </svg>
);

export const ShadingIcon = ({ size = 16, color = '#FFFFFF' }: P & { color?: string }) => (
  <span className="relative inline-flex flex-col items-center leading-none" aria-hidden>
    <svg width={size} height={size - 3} viewBox="0 0 16 13">
      <path d="M3 6.5L8 1.5l5 5-5 5z" fill="#fff" stroke="#444" />
      <path d="M13 8c0 0 1.8 2.2 1.8 3.2a1.8 1.8 0 01-3.6 0C11.2 10.2 13 8 13 8z" fill="#444" />
    </svg>
    <span className="block w-[16px] h-[4px]" style={{ background: color, outline: '1px solid #ccc' }} />
  </span>
);

export const BordersIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <rect x="2" y="2" width="12" height="12" fill="none" stroke="#999" strokeDasharray="1 1" />
    <path d="M8 2v12M2 8h12" stroke="#999" strokeDasharray="1 1" />
    <path d="M2 14h12" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export const FindIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M10 10l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const ReplaceIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <text x="0" y="7" fontSize="7" fontFamily="Segoe UI, Arial" fill="currentColor">ab</text>
    <text x="7" y="15" fontSize="7" fontFamily="Segoe UI, Arial" fill={BL}>ac</text>
    <path d="M10 2.5h3.5v3M12 4l1.5 1.5L15 4" stroke={BL} fill="none" strokeWidth="1" />
  </svg>
);

export const SelectIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <path d="M3 1.5v11l3-2.5 2 4.5 1.8-.8-2-4.4H12z" fill="#fff" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
  </svg>
);

export const DictateIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="10.5" y="3" width="9" height="15" rx="4.5" fill={B2} />
    <path d="M7 14a8 8 0 0016 0M15 22v5M10.5 27h9" stroke={GR} strokeWidth="1.6" fill="none" />
  </svg>
);

export const EditorIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M4 26l3-9L21 3l6 6-14 14z" fill="#fff" stroke={GR} strokeWidth="1.3" />
    <path d="M21 3l6 6-3 3-6-6z" fill={B2} />
    <path d="M4 26l3-9 6 6z" fill="#F2C811" />
  </svg>
);

export const StylesPaneIcon = () => (
  <svg width="28" height="30" viewBox="0 0 28 30" aria-hidden>
    <text x="2" y="18" fontSize="16" fontFamily="Calibri, Carlito, sans-serif" fill={BL}>A</text>
    <path d="M14 8l10 10-4 4-10-10z" fill="#F4B183" stroke="#7F6000" strokeWidth=".7" />
  </svg>
);

const doc = (inner: React.ReactNode, w = 30, h = 30) => (
  <svg width={w} height={h} viewBox="0 0 30 30" aria-hidden>
    <path d="M6 3h13l5 5v19H6z" fill="#fff" stroke={GR} strokeWidth="1.1" />
    <path d="M19 3v5h5" fill="none" stroke={GR} strokeWidth="1.1" />
    {inner}
  </svg>
);

export const CoverPageIcon = () => doc(<><rect x="9" y="9" width="12" height="6" fill={B2} /><path d="M9 18h12M9 21h9" stroke="#999" /></>);
export const BlankPageIcon = () => doc(<path d="M15 12v10M10 17h10" stroke={B2} strokeWidth="1.6" />);
export const PageBreakIcon = () =>
  doc(
    <>
      <path d="M9 9h12M9 12h12" stroke="#999" />
      <path d="M3 16h24" stroke={B2} strokeWidth="1.3" strokeDasharray="2 1.5" />
      <path d="M9 20h12M9 23h9" stroke="#999" />
    </>,
  );
export const TableIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="5" width="24" height="20" fill="#fff" stroke={GR} />
    <rect x="3" y="5" width="24" height="5" fill={B2} />
    <path d="M3 15h24M3 20h24M11 10v15M19 10v15" stroke="#9DC3E6" />
  </svg>
);
export const PicturesIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="5" width="24" height="20" rx="1.5" fill="#fff" stroke={GR} />
    <circle cx="10" cy="11" r="2.5" fill="#F2C811" />
    <path d="M4 24l7-8 5 5 4-4 6 7z" fill="#70AD47" />
  </svg>
);
export const ShapesIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <circle cx="10" cy="11" r="6" fill="#fff" stroke={B2} strokeWidth="1.5" />
    <rect x="13" y="13" width="13" height="12" fill={B2} opacity=".85" />
  </svg>
);
export const IconsIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M15 4l3 6.5 7 .8-5.2 4.8 1.4 7L15 19.5 8.8 23l1.4-7L5 11.3l7-.8z" fill="#fff" stroke={GR} strokeWidth="1.2" />
  </svg>
);
export const SmartArtIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="11" y="3" width="8" height="6" fill="#70AD47" />
    <rect x="3" y="20" width="8" height="6" fill={B2} />
    <rect x="19" y="20" width="8" height="6" fill="#ED7D31" />
    <path d="M15 9v5M7 14h16M7 14v6M23 14v6" stroke={GR} />
  </svg>
);
export const ChartIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M4 26h23" stroke={GR} />
    <rect x="6" y="14" width="4" height="12" fill={B2} />
    <rect x="12" y="8" width="4" height="18" fill="#ED7D31" />
    <rect x="18" y="17" width="4" height="9" fill="#A5A5A5" />
  </svg>
);
export const LinkIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M13 17a5 5 0 007 0l4-4a5 5 0 00-7-7l-1.5 1.5" fill="none" stroke={B2} strokeWidth="2.2" strokeLinecap="round" />
    <path d="M17 13a5 5 0 00-7 0l-4 4a5 5 0 007 7l1.5-1.5" fill="none" stroke={GR} strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
export const BookmarkIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M8 3h14v24l-7-5-7 5z" fill={B2} />
  </svg>
);
export const CommentIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M4 5h22v15H13l-6 5v-5H4z" fill="#fff" stroke={GR} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M15 9v7M11.5 12.5h7" stroke={B2} strokeWidth="1.6" />
  </svg>
);
export const HeaderIcon = () => doc(<><rect x="8" y="5.5" width="11" height="4" fill={B2} /><path d="M9 14h12M9 17h12M9 20h9" stroke="#999" /></>);
export const FooterIcon = () => doc(<><path d="M9 8h12M9 11h12M9 14h9" stroke="#999" /><rect x="8" y="21" width="14" height="4" fill={B2} /></>);
export const PageNumberIcon = () => doc(<><text x="11" y="23" fontSize="9" fontFamily="Segoe UI, Arial" fill={B2}>#</text><path d="M9 9h12M9 12h12" stroke="#999" /></>);
export const TextBoxIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="4" y="6" width="22" height="18" fill="#fff" stroke={GR} />
    <text x="9" y="20" fontSize="12" fontFamily="Calibri, Carlito" fill={B2}>A</text>
    <path d="M18 11h5M18 15h5M18 19h5" stroke="#999" />
  </svg>
);
export const WordArtIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <text x="6" y="24" fontSize="22" fontWeight="700" fontFamily="Segoe UI, Arial" fill="#fff" stroke={B2} strokeWidth="1.2">A</text>
  </svg>
);
export const DropCapIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <text x="3" y="17" fontSize="17" fontFamily="Cambria, Caladea, serif" fill={B2}>A</text>
    <path d="M16 6h11M16 10h11M16 14h11M4 20h23M4 24h23" stroke="#999" />
  </svg>
);
export const DateTimeIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="4" y="6" width="22" height="20" rx="1.5" fill="#fff" stroke={GR} />
    <rect x="4" y="6" width="22" height="5" fill={B2} />
    <path d="M9 4v4M21 4v4M9 16h3M14 16h3M19 16h3M9 21h3M14 21h3" stroke={GR} strokeWidth="1.3" />
  </svg>
);
export const EquationIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <text x="5" y="22" fontSize="20" fontFamily="Cambria Math, Caladea, serif" fill={B2}>π</text>
  </svg>
);
export const SymbolIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <text x="5" y="23" fontSize="21" fontFamily="Cambria, Caladea, serif" fill={GR}>Ω</text>
  </svg>
);
export const MarginsIcon = () => doc(<rect x="9" y="7" width="12" height="16" fill="none" stroke={B2} strokeDasharray="2 1" />);
export const OrientationIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="4" y="9" width="17" height="13" fill="#fff" stroke={GR} />
    <rect x="12" y="4" width="13" height="17" fill="#fff" stroke={B2} />
    <path d="M7 6a6 6 0 016-2" stroke={GR} fill="none" />
  </svg>
);
export const SizeIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="5" y="4" width="15" height="21" fill="#fff" stroke={GR} />
    <rect x="10" y="9" width="15" height="18" fill="#fff" stroke={B2} />
  </svg>
);
export const ColumnsIcon = () => doc(<><path d="M9 9h5M9 12h5M9 15h5M9 18h5M16 9h5M16 12h5M16 15h5M16 18h5" stroke={B2} /></>);
export const BreaksIcon = () =>
  doc(
    <>
      <path d="M9 9h12" stroke="#999" />
      <path d="M3 14h24" stroke={B2} strokeDasharray="2 1.5" />
      <path d="M9 19h12M9 22h8" stroke="#999" />
    </>,
  );
export const LineNumbersIcon = () => doc(<><text x="7" y="13" fontSize="5" fill={B2}>1</text><text x="7" y="19" fontSize="5" fill={B2}>2</text><path d="M11 11h10M11 17h10" stroke="#999" /></>);
export const HyphenationIcon = () => doc(<><path d="M9 10h12M9 14h8M18.5 14h2.5M9 18h12" stroke="#999" /><path d="M17.5 14h1" stroke={B2} strokeWidth="1.5" /></>);
export const WatermarkIcon = () => doc(<text x="8" y="21" fontSize="9" fontFamily="Segoe UI" fill="#B4C7E7" transform="rotate(-35 15 17)">DRAFT</text>);
export const PageColorIcon = () => doc(<rect x="8" y="10" width="13" height="13" fill="#FBE5D6" />);
export const PageBordersIcon = () => doc(<rect x="8.5" y="7.5" width="13" height="16" fill="none" stroke={B2} strokeWidth="1.4" />);
export const TocIcon = () => doc(<><path d="M9 9h8M9 13h10M9 17h10M9 21h8" stroke="#999" /><path d="M20 9h2M21 13h1M21 17h1M20 21h2" stroke={B2} /></>);
export const FootnoteIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M6 3h18v24H6z" fill="#fff" stroke={GR} />
    <path d="M9 7h10M9 10h12M9 13h8" stroke="#999" />
    <text x="19" y="12" fontSize="6" fill={B2}>1</text>
    <path d="M9 20h6" stroke={GR} />
    <text x="9" y="25" fontSize="5" fill={B2}>1</text>
    <path d="M12 23.5h9" stroke="#999" />
  </svg>
);
export const CaptionIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="5" y="4" width="20" height="15" fill="#fff" stroke={GR} />
    <path d="M6 18l6-7 4 4 3-3 5 6z" fill="#9DC3E6" />
    <path d="M5 23h20M5 26h14" stroke={B2} />
  </svg>
);
export const SpellingIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <text x="3" y="16" fontSize="12" fontFamily="Segoe UI, Arial" fill={GR}>abc</text>
    <path d="M8 22l4 4 10-10" stroke={B2} strokeWidth="2.2" fill="none" />
  </svg>
);
export const ThesaurusIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M5 5h9a3 3 0 013 3v17a2 2 0 00-2-2H5z" fill="#fff" stroke={GR} />
    <path d="M25 5h-9a3 3 0 00-3 3v17a2 2 0 012-2h10z" fill="#fff" stroke={GR} />
    <path d="M8 10h5M8 14h5M17 10h5M17 14h5" stroke={B2} />
  </svg>
);
export const WordCountIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="5" y="4" width="20" height="22" fill="#fff" stroke={GR} />
    <text x="7" y="14" fontSize="7" fontFamily="Segoe UI" fill={B2}>ABC</text>
    <text x="8" y="23" fontSize="7" fontFamily="Segoe UI" fill={GR}>123</text>
  </svg>
);
export const ReadAloudIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <text x="3" y="15" fontSize="11" fontFamily="Segoe UI" fill={GR}>A</text>
    <path d="M14 13h3l4-4v13l-4-4h-3z" fill={B2} />
    <path d="M23 11a5 5 0 010 8M25 9a8 8 0 010 12" stroke={B2} fill="none" />
  </svg>
);
export const TrackChangesIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M6 3h13l5 5v19H6z" fill="#fff" stroke={GR} />
    <path d="M9 10h12M9 14h7" stroke="#999" />
    <path d="M9 18h10" stroke="#C00000" strokeWidth="1.3" />
    <path d="M14 27l9-9 2 2-9 9h-2z" fill="#F2C811" stroke={GR} strokeWidth=".7" />
  </svg>
);
export const AcceptIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M6 3h13l5 5v19H6z" fill="#fff" stroke={GR} />
    <path d="M10 16l4 4 8-9" stroke="#107C41" strokeWidth="2.4" fill="none" />
  </svg>
);
export const RejectIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M6 3h13l5 5v19H6z" fill="#fff" stroke={GR} />
    <path d="M11 12l8 8M19 12l-8 8" stroke="#C00000" strokeWidth="2.2" />
  </svg>
);
export const CompareIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="5" width="11" height="15" fill="#fff" stroke={GR} />
    <rect x="16" y="10" width="11" height="15" fill="#fff" stroke={B2} />
  </svg>
);
export const ProtectIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="7" y="13" width="16" height="13" rx="1.5" fill="#F2C811" stroke="#7F6000" strokeWidth=".8" />
    <path d="M10 13V9a5 5 0 0110 0v4" stroke={GR} strokeWidth="2" fill="none" />
  </svg>
);
export const ReadModeIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M3 7c4-1 8-1 12 2 4-3 8-3 12-2v17c-4-1-8-1-12 2-4-3-8-3-12-2z" fill="#fff" stroke={GR} />
    <path d="M15 9v17" stroke={GR} />
    <path d="M6 12h6M6 15h6M18 12h6M18 15h6" stroke={B2} />
  </svg>
);
export const PrintLayoutIcon = () => doc(<path d="M9 9h12M9 12h12M9 15h12M9 18h12M9 21h8" stroke={B2} />);
export const WebLayoutIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="5" width="24" height="20" rx="1" fill="#fff" stroke={GR} />
    <path d="M3 9h24" stroke={GR} />
    <circle cx="15" cy="17" r="5" fill="none" stroke={B2} />
    <path d="M10 17h10M15 12c-2 3-2 7 0 10M15 12c2 3 2 7 0 10" stroke={B2} fill="none" />
  </svg>
);
export const OutlineIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <circle cx="6" cy="8" r="1.5" fill={B2} />
    <circle cx="10" cy="15" r="1.5" fill={B2} />
    <circle cx="10" cy="22" r="1.5" fill={B2} />
    <path d="M10 8h15M14 15h11M14 22h11" stroke={GR} />
  </svg>
);
export const DraftIcon = () => doc(<path d="M9 10h12M9 13h12M9 16h12M9 19h12" stroke="#999" />);
export const FocusIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <path d="M4 10V4h6M20 4h6v6M26 20v6h-6M10 26H4v-6" stroke={GR} strokeWidth="1.5" fill="none" />
    <rect x="10" y="9" width="10" height="12" fill="#fff" stroke={B2} />
  </svg>
);
export const ZoomIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <circle cx="13" cy="13" r="8" fill="#fff" stroke={GR} strokeWidth="1.6" />
    <path d="M19 19l7 7" stroke={GR} strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);
export const Zoom100Icon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <circle cx="13" cy="13" r="9" fill="#fff" stroke={GR} strokeWidth="1.4" />
    <text x="6" y="16.5" fontSize="8" fontFamily="Segoe UI" fill={B2}>100</text>
    <path d="M19.5 19.5l6.5 6.5" stroke={GR} strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
export const OnePageIcon = () => doc(<path d="M9 9h12M9 12h12M9 15h12" stroke="#999" />, 22, 22);
export const MultiPageIcon = () => (
  <svg width="22" height="22" viewBox="0 0 30 30" aria-hidden>
    <rect x="2" y="5" width="12" height="18" fill="#fff" stroke={GR} />
    <rect x="16" y="5" width="12" height="18" fill="#fff" stroke={GR} />
  </svg>
);
export const PageWidthIcon = () => (
  <svg width="22" height="22" viewBox="0 0 30 30" aria-hidden>
    <rect x="6" y="4" width="18" height="22" fill="#fff" stroke={GR} />
    <path d="M2 15h26M2 15l3-3M2 15l3 3M28 15l-3-3M28 15l-3 3" stroke={B2} />
  </svg>
);
export const NewWindowIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="7" width="18" height="15" fill="#fff" stroke={GR} />
    <rect x="9" y="3" width="18" height="15" fill="#fff" stroke={B2} />
  </svg>
);
export const CloseHeaderIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="4" y="4" width="22" height="22" rx="2" fill="#C42B1C" />
    <path d="M10 10l10 10M20 10l-10 10" stroke="#fff" strokeWidth="2.4" />
  </svg>
);
export const EnvelopeIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="7" width="24" height="16" fill="#fff" stroke={GR} />
    <path d="M3 7l12 9 12-9" stroke={GR} fill="none" />
  </svg>
);
export const LabelsIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="4" y="3" width="22" height="24" fill="#fff" stroke={GR} />
    <rect x="7" y="6" width="7" height="5" fill="#9DC3E6" />
    <rect x="16" y="6" width="7" height="5" fill="#9DC3E6" />
    <rect x="7" y="13" width="7" height="5" fill="#9DC3E6" />
    <rect x="16" y="13" width="7" height="5" fill="#9DC3E6" />
  </svg>
);
export const MailMergeIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="9" width="17" height="13" fill="#fff" stroke={GR} />
    <path d="M3 9l8.5 6.5L20 9" stroke={GR} fill="none" />
    <path d="M17 5h10v12H17" fill="#fff" stroke={B2} />
  </svg>
);
export const HelpIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <circle cx="15" cy="15" r="11" fill="#fff" stroke={B2} strokeWidth="1.6" />
    <text x="11" y="21" fontSize="15" fontFamily="Segoe UI" fill={B2}>?</text>
  </svg>
);
export const DesignThemeIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <text x="3" y="20" fontSize="16" fontFamily="Calibri, Carlito" fill={GR}>Aa</text>
    <rect x="3" y="23" width="6" height="4" fill="#4472C4" />
    <rect x="10" y="23" width="6" height="4" fill="#ED7D31" />
    <rect x="17" y="23" width="6" height="4" fill="#A5A5A5" />
    <rect x="24" y="23" width="4" height="4" fill="#FFC000" />
  </svg>
);
export const ColorsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
    <rect x="1" y="2" width="9" height="8" fill="#4472C4" />
    <rect x="12" y="2" width="9" height="8" fill="#ED7D31" />
    <rect x="1" y="12" width="9" height="8" fill="#FFC000" />
    <rect x="12" y="12" width="9" height="8" fill="#70AD47" />
  </svg>
);
export const FontsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
    <text x="0" y="17" fontSize="15" fontFamily="Cambria, Caladea, serif" fill={GR}>A</text>
    <text x="10" y="17" fontSize="12" fontFamily="Calibri, Carlito" fill={B2}>a</text>
  </svg>
);
export const ParaSpacingIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
    <path d="M8 4h13M8 8h13M8 14h13M8 18h13" stroke={GR} />
    <path d="M3 3v16M1 5l2-2 2 2M1 17l2 2 2-2" stroke={B2} fill="none" />
  </svg>
);
export const InsertRowAboveIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="12" width="24" height="15" fill="#fff" stroke={GR} />
    <path d="M3 19.5h24M11 12v15M19 12v15" stroke="#C8C8C8" />
    <rect x="3" y="3" width="24" height="7" fill="#DEEBF7" stroke={B2} />
    <path d="M15 4v5M12.5 6.5h5" stroke={B2} strokeWidth="1.5" />
  </svg>
);
export const InsertRowBelowIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="3" width="24" height="15" fill="#fff" stroke={GR} />
    <path d="M3 10.5h24M11 3v15M19 3v15" stroke="#C8C8C8" />
    <rect x="3" y="20" width="24" height="7" fill="#DEEBF7" stroke={B2} />
    <path d="M15 21v5M12.5 23.5h5" stroke={B2} strokeWidth="1.5" />
  </svg>
);
export const InsertColLeftIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="12" y="3" width="15" height="24" fill="#fff" stroke={GR} />
    <path d="M19.5 3v24M12 11h15M12 19h15" stroke="#C8C8C8" />
    <rect x="3" y="3" width="7" height="24" fill="#DEEBF7" stroke={B2} />
    <path d="M6.5 12.5v5M4 15h5" stroke={B2} strokeWidth="1.5" />
  </svg>
);
export const InsertColRightIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="3" width="15" height="24" fill="#fff" stroke={GR} />
    <path d="M10.5 3v24M3 11h15M3 19h15" stroke="#C8C8C8" />
    <rect x="20" y="3" width="7" height="24" fill="#DEEBF7" stroke={B2} />
    <path d="M23.5 12.5v5M21 15h5" stroke={B2} strokeWidth="1.5" />
  </svg>
);
export const DeleteTableIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    <rect x="3" y="5" width="20" height="18" fill="#fff" stroke={GR} />
    <path d="M3 11h20M3 17h20M10 5v18M16 5v18" stroke="#C8C8C8" />
    <path d="M19 19l8 8M27 19l-8 8" stroke="#C00000" strokeWidth="2" />
  </svg>
);
export const MergeCellsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
    <rect x="1" y="4" width="20" height="14" fill="#fff" stroke={GR} />
    <path d="M4 11h14M4 11l2-2M4 11l2 2M18 11l-2-2M18 11l-2 2" stroke={B2} fill="none" />
  </svg>
);
export const SplitCellsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
    <rect x="1" y="4" width="20" height="14" fill="#fff" stroke={GR} />
    <path d="M11 4v14" stroke={GR} />
    <path d="M9 11H3M3 11l2-2M3 11l2 2M13 11h6M19 11l-2-2M19 11l-2 2" stroke={B2} fill="none" />
  </svg>
);
export const AlignCellIcon = ({ h, v }: { h: 0 | 1 | 2; v: 0 | 1 | 2 }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <rect x="1" y="1" width="14" height="14" fill="none" stroke="#999" />
    {[0, 1, 2].map((k) => {
      const y = 3.5 + v * 3.5 + k * 1.8;
      const w = k === 1 ? 6 : 8;
      const x = h === 0 ? 3 : h === 1 ? 8 - w / 2 : 13 - w;
      return <path key={k} d={`M${x} ${y}h${w}`} stroke="currentColor" strokeWidth="1" />;
    })}
  </svg>
);
