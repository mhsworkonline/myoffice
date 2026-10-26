// Drawing objects that sit in the text like pictures: text boxes, WordArt, charts, SmartArt and
// shapes (the `obj` node), plus equations (the `equation` node, linear-format math).

export type ObjKind = 'textbox' | 'wordart' | 'chart' | 'smartart' | 'shape';

export type ChartType = 'column' | 'stackedColumn' | 'bar' | 'stackedBar' | 'line' | 'lineMarkers' | 'pie' | 'doughnut' | 'area' | 'stackedArea' | 'scatter' | 'combo';

export interface ChartSpec {
  type: ChartType;
  title?: string;
  showTitle: boolean;
  legend: 'right' | 'bottom' | 'top' | 'left' | 'none';
  dataLabels: boolean;
  gridlines: boolean;
  xTitle?: string;
  yTitle?: string;
  style: number;
  colors?: string[];
}

export interface SeriesData {
  name: string;
  values: (number | null)[];
  xValues?: (number | null)[];
  color: string;
  seriesType?: 'column' | 'line' | 'area';
  secondary?: boolean;
}

export interface ChartData {
  categories: string[];
  series: SeriesData[];
}

export interface ChartObj {
  spec: ChartSpec;
  categories: string[];
  series: { name: string; values: (number | null)[]; color?: string }[];
}

export type SmartArtLayout = 'blockList' | 'process' | 'cycle' | 'hierarchy' | 'pyramid' | 'bulletList';

export interface SmartArtObj {
  layout: SmartArtLayout;
  items: { text: string; level: number }[];
  color: string;
}

export interface TextBoxObj {
  /** Body stored in doc.attrs.parts under this id. */
  partId: string;
  fill: string | null;
  line: { color: string; width: number } | null;
  /** Inner margins in pt (Word default 0.1" left/right, 0.05" top/bottom). */
  inset: { l: number; t: number; r: number; b: number };
  vAlign?: 'top' | 'center' | 'bottom';
}

export interface ShapeObj {
  /** One of our shape kinds (see state/shapes.ts) — also the DrawingML preset name mapping. */
  shape: string;
  fill: string | null;
  line: { color: string; width: number } | null;
}

export const PALETTES: string[][] = [
  ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E', '#636363', '#997300'],
  ['#5B9BD5', '#A5A5A5', '#4472C4', '#264478', '#8FAADC', '#C9C9C9', '#1F4E79', '#2E75B6'],
  ['#ED7D31', '#F4B183', '#C55A11', '#F8CBAD', '#843C0C', '#FBE5D6'],
  ['#70AD47', '#A9D18E', '#548235', '#C5E0B4', '#375623', '#E2F0D9'],
  ['#FFC000', '#FFD966', '#BF9000', '#FFE699', '#7F6000', '#FFF2CC'],
  ['#7030A0', '#B4A7D6', '#5B2C86', '#D9D2E9', '#3F1D5C', '#E4DFEC'],
];

export function chartData(o: ChartObj): ChartData {
  const pal = o.spec.colors ?? PALETTES[(Math.max(1, o.spec.style) - 1) % PALETTES.length];
  return {
    categories: o.categories,
    series: o.series.map((s, i) => ({ name: s.name, values: s.values, color: s.color ?? pal[i % pal.length] })),
  };
}

export function defaultChart(type: ChartType = 'column'): ChartObj {
  const pie = type === 'pie' || type === 'doughnut';
  return {
    spec: { type, title: 'Chart Title', showTitle: true, legend: pie ? 'right' : 'bottom', dataLabels: false, gridlines: !pie, style: 1 },
    categories: pie ? ['1st Qtr', '2nd Qtr', '3rd Qtr', '4th Qtr'] : ['Category 1', 'Category 2', 'Category 3', 'Category 4'],
    series: pie
      ? [{ name: 'Sales', values: [8.2, 3.2, 1.4, 1.2] }]
      : [
          { name: 'Series 1', values: [4.3, 2.5, 3.5, 4.5] },
          { name: 'Series 2', values: [2.4, 4.4, 1.8, 2.8] },
          { name: 'Series 3', values: [2, 2, 3, 5] },
        ],
  };
}

export function defaultSmartArt(layout: SmartArtLayout = 'blockList'): SmartArtObj {
  if (layout === 'hierarchy')
    return {
      layout,
      color: '#4472C4',
      items: [
        { text: 'Manager', level: 0 },
        { text: 'Team A', level: 1 },
        { text: 'Member', level: 2 },
        { text: 'Team B', level: 1 },
        { text: 'Member', level: 2 },
      ],
    };
  if (layout === 'bulletList')
    return {
      layout,
      color: '#4472C4',
      items: [
        { text: 'First point', level: 0 },
        { text: 'Detail', level: 1 },
        { text: 'Second point', level: 0 },
        { text: 'Detail', level: 1 },
      ],
    };
  return { layout, color: '#4472C4', items: ['Text', 'Text', 'Text', 'Text', 'Text'].slice(0, layout === 'process' || layout === 'pyramid' ? 3 : layout === 'cycle' ? 5 : 5).map((t) => ({ text: '[' + t + ']', level: 0 })) };
}

export const TEXTBOX_INSET = { l: 7.2, t: 3.6, r: 7.2, b: 3.6 };
