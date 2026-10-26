// Built-in templates for File > New.
import { Node as PMNode } from 'prosemirror-model';
import { newDocument } from '../model/document';
import { addList, bulletAbstract } from '../model/numbering';
import { M, N, schema } from '../model/schema';
import { cloneSheet } from './design';

export interface Template {
  id: string;
  name: string;
  make: () => PMNode;
}

const t = (s: string, p?: Record<string, unknown>) => schema.text(s, p ? [M.run.create({ p })] : []);
const P = (style: string, content: (PMNode | string)[] = [], pp: Record<string, unknown> = {}) =>
  N.paragraph.create({ style, pp }, content.map((c) => (typeof c === 'string' ? schema.text(c) : c)));

function withDoc(blocks: PMNode[], tweak?: (attrs: Record<string, unknown>) => void): PMNode {
  const base = newDocument();
  const attrs = { ...base.attrs } as Record<string, unknown>;
  tweak?.(attrs);
  return N.doc.create(attrs, blocks);
}

export const TEMPLATES: Template[] = [
  { id: 'blank', name: 'Blank document', make: () => newDocument() },
  {
    id: 'single',
    name: 'Single spaced (blank)',
    make: () =>
      withDoc([P('Normal')], (a) => {
        const sh = cloneSheet(a.styles as never);
        sh.docDefaults.para = { ...sh.docDefaults.para, spAfter: 0, lineRule: 'auto', line: 1 };
        a.styles = sh;
      }),
  },
  {
    id: 'report',
    name: 'Report',
    make: () =>
      withDoc([
        P('Title', ['Report Title']),
        P('Subtitle', ['Subtitle or summary of the report']),
        P('Heading1', ['Introduction']),
        P('Normal', ['To get started right away, just click any placeholder text (such as this) and start typing to replace it with your own.']),
        P('Heading1', ['Findings']),
        P('Heading2', ['First finding']),
        P('Normal', ['Use the Styles gallery on the Home tab to apply the formatting you see here with a single click.']),
        P('Heading2', ['Second finding']),
        P('Normal', ['Want to insert a picture from your files or add a shape, text box, or table? You got it! On the Insert tab of the ribbon, just tap the option you need.']),
        P('Heading1', ['Conclusion']),
        P('Normal', ['Summarize the report here.']),
      ]),
  },
  {
    id: 'letter',
    name: 'Letter',
    make: () =>
      withDoc([
        P('Normal', ['Your Name'], { spAfter: 0 }),
        P('Normal', ['Street Address'], { spAfter: 0 }),
        P('Normal', ['City, ST ZIP Code'], { spAfter: 12 }),
        P('Normal', [new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })], { spAfter: 12 }),
        P('Normal', ['Recipient Name'], { spAfter: 0 }),
        P('Normal', ['Title'], { spAfter: 0 }),
        P('Normal', ['Company Name'], { spAfter: 0 }),
        P('Normal', ['Street Address'], { spAfter: 0 }),
        P('Normal', ['City, ST ZIP Code'], { spAfter: 12 }),
        P('Normal', ['Dear Recipient Name,']),
        P('Normal', ['If you’re ready to write, just select this text and start typing to replace it with your own.']),
        P('Normal', ['Sincerely,'], { spBefore: 12, spAfter: 36 }),
        P('Normal', ['Your Name']),
      ]),
  },
  {
    id: 'resume',
    name: 'Resume',
    make: () =>
      withDoc([
        P('Title', ['Your Name'], { align: 'center' }),
        P('Normal', ['Address · Phone · Email · LinkedIn'], { align: 'center', spAfter: 18 }),
        P('Heading1', ['Objective']),
        P('Normal', ['To replace this text with your own, just click it and start typing.']),
        P('Heading1', ['Experience']),
        P('Heading2', ['Job Title · Company']),
        P('Normal', [t('Dates From – To', { italic: true, color: '#595959' })], { spAfter: 4 }),
        P('Normal', ['Describe your responsibilities and achievements in terms of impact and results.']),
        P('Heading1', ['Education']),
        P('Heading2', ['Degree · School']),
        P('Normal', ['You might want to include your GPA and a summary of relevant coursework, awards, and honors.']),
        P('Heading1', ['Skills']),
        P('Normal', ['List your strengths relevant for the role you’re applying for.']),
      ]),
  },
  {
    id: 'notes',
    name: 'Meeting notes',
    make: () => {
      const base = newDocument();
      const r = addList(base.attrs.numbering, (id) => bulletAbstract(id));
      const li = (s: string) => N.paragraph.create({ style: 'ListParagraph', pp: { numId: r.numId, ilvl: 0 } }, schema.text(s));
      return N.doc.create({ ...base.attrs, numbering: r.numbering }, [
        P('Title', ['Meeting Notes']),
        P('Normal', [t('Date: ', { bold: true }), new Date().toLocaleDateString()], { spAfter: 0 }),
        P('Normal', [t('Attendees: ', { bold: true }), 'Names'], { spAfter: 12 }),
        P('Heading1', ['Agenda']),
        li('Topic one'),
        li('Topic two'),
        P('Heading1', ['Notes']),
        P('Normal', ['Type your notes here.']),
        P('Heading1', ['Action items']),
        li('Owner — action — due date'),
      ]);
    },
  },
];
