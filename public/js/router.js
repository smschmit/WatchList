// Hash routing and the top-level render.
import { catByKey, RANGE, rebuildActorIndex, rebuildStatusColors } from './categories.js';

// ---------- Routing ----------
export function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'browse', id: parts[1] ? decodeURIComponent(parts[1]) : null, params: new URLSearchParams(qs || '') };
}
export function go(hash) { location.hash = hash; }
export function listHash(filters, q, sort) {
  const p = new URLSearchParams();
  for (const f of filters) p.append(f.not ? `x-${f.cat}` : f.cat, f.value);
  if (q) p.set('q', q);
  if (sort && sort !== 'title') p.set('sort', sort);
  const s = p.toString();
  return `#/list${s ? `?${s}` : ''}`;
}
export function filtersFrom(params) {
  const out = [];
  for (const [k, v] of params) {
    if (catByKey[k] || (RANGE[k] && /^\d{4}$/.test(v))) out.push({ cat: k, value: v });
    else if (k.startsWith('x-') && catByKey[k.slice(2)]) out.push({ cat: k.slice(2), value: v, not: true });
  }
  return out;
}
export const scrollPos = new Map();
// Per-page memory of how much was expanded ("Show more", "All 120 tags"), keyed by the URL like scrollPos,
// so Back, and re-renders after an edit, bring a long list back to the same length and the scroll lands where it was.
const pageMem = new Map();
export function recall(key, fallback) {
  const v = pageMem.get(`${location.hash}\u0000${key}`);
  return v === undefined ? fallback : v;
}
export function remember(key, value) { pageMem.set(`${location.hash}\u0000${key}`, value); }
export let lastHash = location.hash;
// Call after changing the URL with history.replaceState/pushState, so scroll memory stays right.
export function syncLastHash() { lastHash = location.hash; }
window.addEventListener('hashchange', () => {
  scrollPos.set(lastHash, window.scrollY);
  lastHash = location.hash;
  render();
  window.scrollTo(0, scrollPos.get(location.hash) || 0);
});

// ---------- Render ----------
// Page name -> function(route) returning the page's element. Filled in by main.js.
let views = {};
export function setViews(v) { views = v; }
export function render() {
  rebuildStatusColors();
  rebuildActorIndex();
  const r = route();
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.name));
  const search = document.getElementById('search');
  if (document.activeElement !== search) search.value = r.name === 'list' ? r.params.get('q') || '' : '';
  const main = document.getElementById('main');
  main.replaceChildren((views[r.name] || views.browse)(r));
  if (r.name === 'account' && window.cloud && window.cloud.renderAccount) window.cloud.renderAccount();
}
