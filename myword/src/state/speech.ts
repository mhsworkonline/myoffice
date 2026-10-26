// Review > Read Aloud using the system speech synthesizer (works offline with installed voices).
import { activeState } from './editor';
import { bump } from './store';

let speaking = false;

export function isReading(): boolean {
  return speaking;
}

export function readAloud(): void {
  if (typeof speechSynthesis === 'undefined') return;
  const s = activeState();
  const sel = s.selection;
  const text = sel.empty ? s.doc.textBetween(sel.from, s.doc.content.size, '\n', ' ') : s.doc.textBetween(sel.from, sel.to, '\n', ' ');
  if (!text.trim()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 32000));
  u.onend = u.onerror = () => {
    speaking = false;
    bump();
  };
  speaking = true;
  speechSynthesis.speak(u);
  bump();
}

export function stopReading(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  speaking = false;
  bump();
}
