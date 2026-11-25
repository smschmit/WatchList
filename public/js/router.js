// Hash routing and the top-level render.
import { catByKey, RANGE, rebuildActorIndex, rebuildStatusColors } from './categories.js';
import { pinTitle } from './pagetitle.js';

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
export function syncLastHash() { lastHash = location.hash; stamp(); }

// How many in-app pages sit behind this one, stamped on each history entry (so it survives reloads),
// letting the Back button use the browser's Back without ever leaving the app.
// Code that calls history.replaceState should pass history.state so the stamp is kept.
// `top` is the depth of the furthest page Forward can reach: a new page drops everything ahead of it.
// Kept in sessionStorage so a reload still knows; without storage Forward just hides after a reload.
let depth = 0, top = 0;
function saveTop() { try { sessionStorage.setItem('watchlist-top', String(top)); } catch {} }
function stamp() {
  const s = history.state;
  if (s && typeof s.depth === 'number') depth = s.depth;
  else { depth += 1; top = depth; saveTop(); history.replaceState({ ...(s || {}), depth }, ''); }
}
if (!history.state || typeof history.state.depth !== 'number') {
  history.replaceState({ ...(history.state || {}), depth: 0 }, '');
  saveTop();
} else {
  depth = history.state.depth;
  try { top = Math.max(depth, Number(sessionStorage.getItem('watchlist-top')) || 0); } catch { top = depth; }
}
export function goForward() { if (depth < top) history.forward(); }
export function goBack() {
  if (depth > 0) { history.back(); return; }
  // Opened straight onto an inner page: nothing in-app behind it, so swap this page for Browse.
  history.replaceState({ depth: 0 }, '', '#/');
  lastHash = location.hash;
  render();
  window.scrollTo(0, 0);
}
// Where Back should land on the page just shown. Pages that fill in after a fetch are too short at first,
// so the browser clamps the scroll; they call restoreScroll() once their content is in.
let pendingScroll = null;
export function restoreScroll() {
  if (pendingScroll && pendingScroll.hash === location.hash) window.scrollTo(0, pendingScroll.y);
  pendingScroll = null;
}
window.addEventListener('hashchange', () => {
  scrollPos.set(lastHash, window.scrollY);
  lastHash = location.hash;
  stamp();
  render();
  const y = scrollPos.get(location.hash) || 0;
  pendingScroll = y ? { hash: location.hash, y } : null;
  window.scrollTo(0, y);
});

// ---------- Render ----------
// Page name -> function(route) returning the page's element. Filled in by main.js.
let views = {};
export function setViews(v) { views = v; }
export function render() {
  rebuildStatusColors();
  rebuildActorIndex();
  const r = route();
  document.getElementById('back-btn').hidden = depth === 0 && r.name === 'browse';
  document.getElementById('fwd-btn').hidden = depth >= top;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.name));
  const search = document.getElementById('search');
  if (document.activeElement !== search) search.value = r.name === 'list' ? r.params.get('q') || '' : '';
  const main = document.getElementById('main');
  pinTitle(null); // detail pages pin their own name after this
  main.replaceChildren((views[r.name] || views.browse)(r));
  if (r.name === 'account' && window.cloud && window.cloud.renderAccount) window.cloud.renderAccount();
}
