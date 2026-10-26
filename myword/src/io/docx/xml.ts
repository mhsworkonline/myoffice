// Small helpers for reading and writing WordprocessingML.

export const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  v: 'urn:schemas-microsoft-com:vml',
};

export function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

/** Element children with a given local name (any namespace prefix). */
export function kids(el: Element | null | undefined, name?: string): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (!name || c.localName === name) out.push(c);
  return out;
}

export function kid(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) return c;
  return null;
}

/** First descendant with a local name. */
export function find(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  const all = el.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) if (all[i].localName === name) return all[i];
  return null;
}

export function findAll(el: Element | null | undefined, name: string): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  const all = el.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) if (all[i].localName === name) out.push(all[i]);
  return out;
}

/** Attribute by local name, ignoring the prefix (w:val, r:id, ...). */
export function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  const direct = el.getAttribute('w:' + name) ?? el.getAttribute(name);
  if (direct !== null) return direct;
  for (const a of Array.from(el.attributes)) if (a.localName === name) return a.value;
  return null;
}

export function num(el: Element | null | undefined, name: string): number | undefined {
  const v = attr(el, name);
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return isFinite(n) ? n : undefined;
}

/** OOXML on/off property (<w:b/>, <w:b w:val="0"/>, ...). */
export function onOff(el: Element | null | undefined): boolean | undefined {
  if (!el) return undefined;
  const v = attr(el, 'val');
  if (v === null) return true;
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Build an element string; attributes with undefined/null values are skipped. */
export function el(name: string, attrs: Record<string, string | number | boolean | undefined | null> = {}, children = ''): string {
  let a = '';
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    a += ` ${k}="${esc(String(v === true ? 1 : v))}"`;
  }
  return children ? `<${name}${a}>${children}</${name}>` : `<${name}${a}/>`;
}

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
  webp: 'image/webp',
  ico: 'image/x-icon',
};
