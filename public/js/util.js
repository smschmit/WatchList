// Small helpers shared by every module: DOM building, toasts, parsing, downloads.

export function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
export function toNum(v) { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
export function newId(p) { return p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}
let toastTimer;
export function toast(msg, action) {
  const t = document.getElementById('toast');
  t.replaceChildren(el('span', {}, msg));
  if (action) t.append(el('button', { class: 'btn small', onclick: () => { t.hidden = true; action.run(); } }, action.label));
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 3000);
}
export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function download(name, text, type) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const today = () => new Date().toISOString().slice(0, 10);

export function uniq(a) { return [...new Set(a.filter((x) => x != null))]; }
