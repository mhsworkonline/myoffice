// Review > Check Accessibility: a short report of common problems.
import { docNumbering, docStyles } from '../model/document';
import { N } from '../model/schema';
import { effectivePara } from '../layout/paragraph';
import { editorState } from './editor';
import { openDialog } from './store';

export function checkAccessibility(): void {
  const doc = editorState().doc;
  const sh = docStyles(doc);
  const nb = docNumbering(doc);
  const issues: string[] = [];
  let images = 0;
  let lastLevel = -1;
  let tables = 0;
  doc.descendants((n) => {
    if (n.type === N.image && !n.attrs.alt) images++;
    if (n.type === N.table) {
      tables++;
      const first = n.firstChild;
      if (first && !first.attrs.rp?.header) issues.push(`Table ${tables}: no header row is marked (Table Layout > Repeat Header Rows).`);
    }
    if (n.type === N.paragraph) {
      const r = effectivePara(n, sh, nb);
      if (r.outlineLvl !== undefined && r.outlineLvl < 9 && n.textContent.trim()) {
        if (r.outlineLvl > lastLevel + 1) issues.push(`Heading "${n.textContent.slice(0, 40)}" skips a level (Heading ${lastLevel + 2} expected).`);
        lastLevel = r.outlineLvl;
      }
      return false;
    }
    return true;
  });
  if (images) issues.unshift(`${images} picture${images > 1 ? 's are' : ' is'} missing alternative text (right-click > Edit Alt Text).`);
  openDialog('alert', { title: 'Accessibility', message: issues.length ? 'Inspection results:\n\n• ' + issues.join('\n• ') : 'No accessibility issues found. Good to go!', icon: issues.length ? 'warning' : 'info' });
}

export function accessibilityStatus(): 'good' | 'investigate' {
  const doc = editorState().doc;
  let bad = false;
  doc.descendants((n) => {
    if (bad) return false;
    if (n.type === N.image && !n.attrs.alt) bad = true;
    return true;
  });
  return bad ? 'investigate' : 'good';
}
